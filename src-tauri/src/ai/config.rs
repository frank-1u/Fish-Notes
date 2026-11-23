use reqwest::{header::HeaderValue, Url};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};

use crate::{AppError, AppService};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AiProtocol {
    Openai,
    Anthropic,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub protocol: AiProtocol,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAiConfig {
    pub protocol: AiProtocol,
    pub base_url: String,
    pub model: String,
    pub has_api_key: bool,
}

impl AiConfig {
    pub(super) fn endpoint(&self) -> Result<Url, AppError> {
        let invalid_url = || AppError::AiConfig("Enter a valid HTTP or HTTPS base URL.");
        let mut url = Url::parse(self.base_url.trim()).map_err(|_| invalid_url())?;
        if !matches!(url.scheme(), "http" | "https")
            || url.host().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(invalid_url());
        }

        let path = url.path().trim_end_matches('/');
        let version = if path.ends_with("/v1") { "" } else { "/v1" };
        let resource = match self.protocol {
            AiProtocol::Openai => "/chat/completions",
            AiProtocol::Anthropic => "/messages",
        };
        url.set_path(&format!("{path}{version}{resource}"));
        Ok(url)
    }

    fn prepare(&mut self) -> Result<(), AppError> {
        self.base_url = self.base_url.trim().to_owned();
        self.model = self.model.trim().to_owned();
        self.api_key = self.api_key.trim().to_owned();
        self.endpoint()?;
        if self.model.is_empty() {
            return Err(AppError::AiConfig("Enter an AI model name."));
        }
        if self.api_key.is_empty() || HeaderValue::from_str(&self.api_key).is_err() {
            return Err(AppError::AiConfig("Enter a valid API key."));
        }
        Ok(())
    }

    fn keep_saved_key(&mut self, conn: &Connection) -> Result<(), AppError> {
        if self.api_key.trim().is_empty() {
            self.api_key = read_config(conn)?.map_or_else(String::new, |saved| saved.api_key);
        }
        Ok(())
    }
}

fn read_config(conn: &Connection) -> Result<Option<AiConfig>, AppError> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'ai_config'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    // Old CLI configurations have neither a protocol nor a base URL.
    Ok(value.and_then(|value| serde_json::from_str(&value).ok()))
}

impl AppService {
    pub fn get_ai_config(&self) -> Result<Option<PublicAiConfig>, AppError> {
        let conn = self.database.get()?;
        Ok(read_config(&conn)?.map(|config| PublicAiConfig {
            protocol: config.protocol,
            base_url: config.base_url,
            model: config.model,
            has_api_key: !config.api_key.is_empty(),
        }))
    }

    pub fn set_ai_config(&self, mut config: AiConfig) -> Result<(), AppError> {
        let mut conn = self.database.get()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        config.keep_saved_key(&tx)?;
        config.prepare()?;
        let value = serde_json::to_string(&config)
            .map_err(|_| AppError::AiConfig("Invalid AI configuration."))?;
        tx.execute(
            "INSERT INTO app_settings (key, value) VALUES ('ai_config', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [value],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub(super) fn resolve_ai_config(&self, config: Option<AiConfig>) -> Result<AiConfig, AppError> {
        let conn = self.database.get()?;
        let mut config = match config {
            Some(mut config) => {
                config.keep_saved_key(&conn)?;
                config
            }
            None => read_config(&conn)?.ok_or(AppError::AiNotConfigured)?,
        };
        config.prepare()?;
        Ok(config)
    }
}
