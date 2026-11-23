use std::time::Duration;

use eventsource_stream::Eventsource;
use futures_util::StreamExt;
use reqwest::{header::ACCEPT, redirect, Client, Response, StatusCode};
use serde_json::{json, Value};

use crate::{AppError, Message};

use super::{AiConfig, AiProtocol, ChatStreamEvent};

pub(super) trait AiProvider {
    async fn complete(&self, system: &str, messages: &[Message]) -> Result<String, AppError>;

    async fn stream(
        &self,
        system: &str,
        messages: &[Message],
        emit: impl FnMut(ChatStreamEvent) -> Result<(), AppError> + Send,
    ) -> Result<(), AppError>;
}

pub(super) struct HttpProvider<'a> {
    config: AiConfig,
    client: &'a Client,
}

pub(super) fn http_client() -> Result<Client, AppError> {
    Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(120))
        // The provider must not forward credentials, including x-api-key, to a redirect target.
        .redirect(redirect::Policy::none())
        .build()
        .map_err(|_| AppError::AiTransport)
}

impl<'a> HttpProvider<'a> {
    pub(super) fn new(client: &'a Client, config: AiConfig) -> Self {
        Self { config, client }
    }

    async fn request(
        &self,
        system: &str,
        messages: &[Message],
        stream: bool,
    ) -> Result<Response, AppError> {
        let config = &self.config;
        let endpoint = config.endpoint()?;
        let accept = if stream {
            "text/event-stream"
        } else {
            "application/json"
        };
        let request = self.client.post(endpoint).header(ACCEPT, accept);
        let response = match config.protocol {
            AiProtocol::Openai => {
                let mut turns = vec![json!({ "role": "system", "content": system })];
                turns.extend(messages.iter().map(|message| json!(message)));
                request
                    .bearer_auth(&config.api_key)
                    .json(&json!({ "model": config.model, "stream": stream, "messages": turns }))
                    .send()
                    .await
            }
            AiProtocol::Anthropic => {
                let body = json!({
                    "model": config.model,
                    "stream": stream,
                    "system": system,
                    "messages": messages,
                    "max_tokens": 4096,
                });
                let request = request
                    .header("anthropic-version", "2023-06-01")
                    .json(&body);
                let response = request
                    .try_clone()
                    .expect("JSON request body is cloneable")
                    .header("x-api-key", &config.api_key)
                    .send()
                    .await;
                if response.as_ref().is_ok_and(|r| {
                    matches!(r.status(), StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN)
                }) {
                    drop(response);
                    request.bearer_auth(&config.api_key).send().await
                } else {
                    response
                }
            }
        }
        .map_err(|_| AppError::AiTransport)?;

        if response.status().is_success() {
            Ok(response)
        } else {
            Err(AppError::AiHttp(response.status().as_u16()))
        }
    }
}

impl AiProvider for HttpProvider<'_> {
    async fn complete(&self, system: &str, messages: &[Message]) -> Result<String, AppError> {
        let value: Value = self
            .request(system, messages, false)
            .await?
            .json()
            .await
            .map_err(|_| AppError::AiResponse)?;
        let content = match self.config.protocol {
            AiProtocol::Openai => value["choices"][0]["message"]["content"]
                .as_str()
                .unwrap_or_default()
                .to_owned(),
            AiProtocol::Anthropic => value["content"]
                .as_array()
                .ok_or(AppError::AiResponse)?
                .iter()
                .filter(|block| block["type"] == "text")
                .filter_map(|block| block["text"].as_str())
                .collect(),
        };
        if content.trim().is_empty() {
            return Err(AppError::AiResponse);
        }
        Ok(content.replace(&self.config.api_key, "[redacted]"))
    }

    async fn stream(
        &self,
        system: &str,
        messages: &[Message],
        mut emit: impl FnMut(ChatStreamEvent) -> Result<(), AppError> + Send,
    ) -> Result<(), AppError> {
        let response = self.request(system, messages, true).await?;
        let mut events = response.bytes_stream().eventsource();
        let mut finished = false;
        let mut text_tail = String::new();
        let mut thinking_tail = String::new();
        while let Some(event) = events.next().await {
            let event = event.map_err(|_| AppError::AiResponse)?;
            if event.event == "error" {
                return Err(AppError::AiResponse);
            }
            if matches!(self.config.protocol, AiProtocol::Openai) && event.data.trim() == "[DONE]" {
                finished = true;
                break;
            }
            let value: Value =
                serde_json::from_str(&event.data).map_err(|_| AppError::AiResponse)?;
            if !value["error"].is_null() || value["type"] == "error" {
                return Err(AppError::AiResponse);
            }

            let (text, thinking) = match self.config.protocol {
                AiProtocol::Openai => {
                    let choice = &value["choices"][0];
                    finished |= choice["finish_reason"].is_string();
                    let delta = &choice["delta"];
                    (
                        delta["content"].as_str(),
                        delta["reasoning_content"]
                            .as_str()
                            .filter(|text| !text.is_empty())
                            .or_else(|| delta["reasoning"].as_str()),
                    )
                }
                AiProtocol::Anthropic => {
                    if value["type"] == "message_stop" {
                        finished = true;
                        break;
                    }
                    let block = match value["type"].as_str() {
                        Some("content_block_start") => &value["content_block"],
                        Some("content_block_delta") => &value["delta"],
                        _ => continue,
                    };
                    match block["type"].as_str() {
                        Some("text" | "text_delta") => (block["text"].as_str(), None),
                        Some("thinking" | "thinking_delta") => (None, block["thinking"].as_str()),
                        _ => continue,
                    }
                }
            };
            let secret = &self.config.api_key;
            if let Some(delta) =
                thinking.and_then(|text| redact_delta(&mut thinking_tail, text, secret))
            {
                emit(ChatStreamEvent::Thinking { delta })?;
            }
            if let Some(delta) = text.and_then(|text| redact_delta(&mut text_tail, text, secret)) {
                emit(ChatStreamEvent::Chunk { delta })?;
            }
        }

        if !finished {
            return Err(AppError::AiResponse);
        }
        if !thinking_tail.is_empty() {
            emit(ChatStreamEvent::Thinking {
                delta: thinking_tail,
            })?;
        }
        if !text_tail.is_empty() {
            emit(ChatStreamEvent::Chunk { delta: text_tail })?;
        }
        Ok(())
    }
}

// Retain a trailing key prefix until the next delta can disambiguate it.
fn redact_delta(tail: &mut String, delta: &str, secret: &str) -> Option<String> {
    let mut text = std::mem::take(tail);
    text.push_str(delta);
    let mut text = text.replace(secret, "[redacted]");
    if let Some((length, _)) = secret
        .char_indices()
        .rev()
        .find(|(length, _)| *length > 0 && text.ends_with(&secret[..*length]))
    {
        *tail = text.split_off(text.len() - length);
    }
    (!text.is_empty()).then_some(text)
}
