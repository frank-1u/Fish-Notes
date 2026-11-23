use std::time::Duration;

use fish_notes::{
    AiConfig, AiProtocol, AppService, ChatRequest, ChatRole, ChatScope, ChatStreamEvent, Message,
    NoteUpdate,
};
use serde_json::json;
use tempfile::tempdir;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    task::JoinHandle,
    time::timeout,
};

#[test]
fn configuration_is_write_only_and_legacy_settings_remain_intact() {
    let data = tempdir().unwrap();
    let app = AppService::open(data.path()).unwrap();
    let db = rusqlite::Connection::open(data.path().join("fish-notes.db")).unwrap();
    let legacy = r#"{"token":"legacy-oauth","model":"claude","claudePath":"/bin/claude"}"#;
    db.execute(
        "INSERT INTO app_settings VALUES ('ai_config', ?1)",
        [legacy],
    )
    .unwrap();
    assert_eq!(app.get_ai_config().unwrap(), None);
    let original: String = db
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'ai_config'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(original, legacy);

    let config = AiConfig {
        protocol: AiProtocol::Openai,
        base_url: "http://127.0.0.1:12345".into(),
        model: "group/deepseek-flash".into(),
        api_key: "example-secret".into(),
    };
    app.set_ai_config(config.clone()).unwrap();
    app.set_ai_config(AiConfig {
        model: "zhipu/glm-5.3".into(),
        api_key: String::new(),
        ..config
    })
    .unwrap();

    assert_eq!(
        serde_json::to_value(
            AppService::open(data.path())
                .unwrap()
                .get_ai_config()
                .unwrap()
        )
        .unwrap(),
        json!({
            "protocol": "openai",
            "baseUrl": "http://127.0.0.1:12345",
            "model": "zhipu/glm-5.3",
            "hasApiKey": true
        })
    );
}

async fn read_request(socket: &mut TcpStream) -> (String, serde_json::Value) {
    let mut bytes = Vec::new();
    let mut buffer = [0; 4096];
    let (header_end, headers) = loop {
        let count = socket.read(&mut buffer).await.unwrap();
        assert_ne!(count, 0);
        bytes.extend_from_slice(&buffer[..count]);
        if let Some(end) = bytes.windows(4).position(|chunk| chunk == b"\r\n\r\n") {
            break (end + 4, String::from_utf8(bytes[..end].to_vec()).unwrap());
        }
    };
    let size: usize = headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length").then_some(value)
        })
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    while bytes.len() < header_end + size {
        let count = socket.read(&mut buffer).await.unwrap();
        assert_ne!(count, 0);
        bytes.extend_from_slice(&buffer[..count]);
    }
    (
        headers,
        serde_json::from_slice(&bytes[header_end..]).unwrap(),
    )
}

async fn mock_server(
    response: impl Into<String>,
    content_type: &'static str,
    keep_open: bool,
) -> (String, JoinHandle<(String, serde_json::Value)>) {
    let response = response.into();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let request = read_request(&mut socket).await;
        let size = if keep_open {
            response.len() + 1024
        } else {
            response.len()
        };
        let headers = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {size}\r\nConnection: close\r\n\r\n"
        );
        socket.write_all(headers.as_bytes()).await.unwrap();
        // Split at the byte level, including inside multi-byte UTF-8.
        for bytes in response.as_bytes().chunks(7) {
            socket.write_all(bytes).await.unwrap();
        }
        if keep_open {
            let mut byte = [0];
            assert_eq!(
                timeout(Duration::from_secs(3), socket.read(&mut byte))
                    .await
                    .unwrap()
                    .unwrap(),
                0
            );
        }
        request
    });
    (format!("http://{address}"), task)
}

fn config(protocol: AiProtocol, base_url: String) -> AiConfig {
    AiConfig {
        protocol,
        base_url,
        api_key: "mock-key".into(),
        model: "group/demo".into(),
    }
}

fn chat_request() -> ChatRequest {
    ChatRequest {
        request_id: "chat-request".into(),
        messages: vec![Message {
            role: ChatRole::User,
            content: "项目蓝鲸在哪里？".into(),
        }],
        note_context: None,
        scope: None,
    }
}

#[tokio::test]
async fn openai_completion_uses_unsaved_form_and_saved_key() {
    let data = tempdir().unwrap();
    let app = AppService::open(data.path()).unwrap();
    let (url, server) = mock_server(
        r#"{"choices":[{"message":{"content":"OK"}}]}"#,
        "application/json",
        false,
    )
    .await;
    let base_url = format!("{url}/gateway/v1/");
    app.set_ai_config(config(AiProtocol::Openai, base_url.clone()))
        .unwrap();
    // Changing to a different endpoint with an empty key must not reuse the saved key.
    assert!(app
        .test_ai_connection(Some(AiConfig {
            api_key: String::new(),
            ..config(AiProtocol::Openai, "http://127.0.0.1:9/other/v1".into())
        }))
        .await
        .is_err());

    let result = app
        .test_ai_connection(Some(AiConfig {
            api_key: String::new(),
            model: "group/unsaved-model".into(),
            ..config(AiProtocol::Openai, base_url.clone())
        }))
        .await
        .unwrap();
    assert_eq!(result, "OK");
    let (headers, body) = server.await.unwrap();
    assert!(headers.starts_with("POST /gateway/v1/chat/completions HTTP/1.1"));
    assert!(headers
        .to_ascii_lowercase()
        .contains("authorization: bearer mock-key"));
    assert_eq!(body["model"], "group/unsaved-model");
    assert_eq!(body["stream"], false);
    assert_eq!(
        app.get_ai_config().unwrap().unwrap().model,
        "group/demo"
    );
}

#[tokio::test]
async fn anthropic_completion_preserves_markdown_and_title_is_concise() {
    let data = tempdir().unwrap();
    let app = AppService::open(data.path()).unwrap();
    let (url, server) = mock_server(
        r#"{"content":[{"type":"thinking","thinking":"hidden"},{"type":"text","text":"    **Clear** Markdown"}]}"#,
        "application/json", false,
    ).await;
    app.set_ai_config(config(AiProtocol::Anthropic, url))
        .unwrap();
    assert_eq!(
        app.polish_text("**plain** Markdown".into()).await.unwrap(),
        "    **Clear** Markdown"
    );
    let (headers, body) = server.await.unwrap();
    assert!(headers.starts_with("POST /v1/messages HTTP/1.1"));
    assert!(headers.contains("x-api-key: mock-key"));
    assert!(headers.contains("anthropic-version: 2023-06-01"));
    assert_eq!(body["messages"][0]["content"], "**plain** Markdown");
    assert_eq!(body["stream"], false);
    assert!(body["max_tokens"].as_u64().unwrap() > 0);

    let (url, server) = mock_server(
        r#"{"content":[{"type":"text","text":"  Blue whale  \n"}]}"#,
        "application/json",
        false,
    )
    .await;
    app.set_ai_config(config(AiProtocol::Anthropic, url))
        .unwrap();
    assert_eq!(
        app.suggest_title("A note about whales".into())
            .await
            .unwrap(),
        "Blue whale"
    );
    server.await.unwrap();
}

const OPENAI_DELTAS: &str = concat!(
    ": heartbeat\r\n\r\n",
    "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"思考\"}}]}\r\n\r\n",
    "data: {\"choices\":[{\"delta\":{\"reasoning\":\"中\"}}]}\n\n",
    "data: {\"choices\":[{\"delta\":\n",
    "data: {\"content\":\"答案\"}}]}\n\n",
);
const ANTHROPIC_DELTAS: &str = concat!(
    "event: content_block_delta\n",
    "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"思考中\"}}\n\n",
    "event: content_block_delta\n",
    "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"答案\"}}\n\n",
);

#[tokio::test]
async fn both_protocols_stream_reasoning_and_text_and_can_cancel() {
    let data = tempdir().unwrap();
    let app = AppService::open(data.path()).unwrap();
    let fixtures = [
        (AiProtocol::Openai, OPENAI_DELTAS, "data: [DONE]\n\n"),
        (
            AiProtocol::Anthropic,
            ANTHROPIC_DELTAS,
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
        ),
    ];
    for (protocol, deltas, end) in fixtures {
        for cancelled in [false, true] {
            let response = if cancelled {
                deltas.to_owned()
            } else {
                format!("{deltas}{end}")
            };
            let (url, server) = mock_server(response, "text/event-stream", cancelled).await;
            app.set_ai_config(config(protocol, url)).unwrap();
            let mut events = Vec::new();
            let mut request = chat_request();
            request.note_context = Some("单篇笔记".into());
            timeout(
                Duration::from_secs(3),
                app.stream_chat(request, |event| {
                    if cancelled && matches!(event, ChatStreamEvent::Chunk { .. }) {
                        app.abort_chat("chat-request");
                    }
                    events.push(event);
                    Ok(())
                }),
            )
            .await
            .unwrap()
            .unwrap();
            assert_eq!(events.first(), Some(&ChatStreamEvent::Started));
            let thinking: String = events
                .iter()
                .filter_map(|event| match event {
                    ChatStreamEvent::Thinking { delta } => Some(delta.as_str()),
                    _ => None,
                })
                .collect();
            assert_eq!(thinking, "思考中");
            assert!(events.contains(&ChatStreamEvent::Chunk {
                delta: "答案".into()
            }));
            assert_eq!(
                events.last(),
                Some(&ChatStreamEvent::Done {
                    full_text: "答案".into(),
                    cancelled
                })
            );
            let (_, body) = server.await.unwrap();
            assert_eq!(body["stream"], true);
            assert!(body.to_string().contains("单篇笔记"));
            if protocol == AiProtocol::Anthropic {
                assert_eq!(body["thinking"]["type"], "enabled");
                assert!(body["max_tokens"].as_u64().unwrap() > body["thinking"]["budget_tokens"].as_u64().unwrap());
            }
        }
    }
}

#[tokio::test]
async fn anthropic_stream_falls_back_when_thinking_is_rejected() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/v1", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let (_, body1) = read_request(&mut socket).await;
        assert_eq!(body1["thinking"]["type"], "enabled");
        socket
            .write_all(
                b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            )
            .await
            .unwrap();

        let (mut socket, _) = listener.accept().await.unwrap();
        let (_, body2) = read_request(&mut socket).await;
        assert!(body2.get("thinking").is_none());
        let sse = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"回退成功\"}}\n\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{sse}",
            sse.len()
        );
        socket.write_all(response.as_bytes()).await.unwrap();
    });

    let data = tempdir().unwrap();
    let app = AppService::open(data.path()).unwrap();
    app.set_ai_config(config(AiProtocol::Anthropic, url)).unwrap();
    let mut events = Vec::new();
    timeout(
        Duration::from_secs(3),
        app.stream_chat(chat_request(), |event| {
            events.push(event);
            Ok(())
        }),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(
        events.last(),
        Some(&ChatStreamEvent::Done {
            full_text: "回退成功".into(),
            cancelled: false
        })
    );
    server.await.unwrap();
}

#[tokio::test]
async fn library_chat_sends_only_matching_unlocked_active_notes() {
    let data = tempdir().unwrap();
    let app = AppService::open(data.path()).unwrap();
    let mut notes = Vec::new();
    for marker in ["visible whale", "trashed whale", "locked whale"] {
        let note = app.create_note().unwrap().summary;
        app.update_note(
            &note.id,
            NoteUpdate {
                title: Some(format!("蓝鲸 {marker}")),
                content_text: Some(format!("蓝鲸 {marker}")),
                ..Default::default()
            },
        )
        .unwrap();
        notes.push(note);
    }
    app.trash_note(&notes[1].id).unwrap();
    let db = rusqlite::Connection::open(data.path().join("fish-notes.db")).unwrap();
    db.execute(
        "UPDATE notes SET is_locked = 1 WHERE id = ?1",
        [&notes[2].id],
    )
    .unwrap();

    for question in ["项目蓝鲸在哪里？", "What is the whale project?"] {
        let (url, server) = mock_server("data: [DONE]\n\n", "text/event-stream", false).await;
        app.set_ai_config(config(AiProtocol::Openai, url)).unwrap();
        let mut request = chat_request();
        request.messages[0].content = question.into();
        request.scope = Some(ChatScope::Notes);
        let mut events = Vec::new();
        app.stream_chat(request, |event| {
            events.push(event);
            Ok(())
        })
        .await
        .unwrap();
        let ChatStreamEvent::Sources { sources } = &events[1] else {
            panic!("missing sources")
        };
        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].id, notes[0].id);
        let (_, body) = server.await.unwrap();
        let system = body["messages"][0]["content"].as_str().unwrap();
        assert!(system.contains("visible whale"));
        assert!(!system.contains("trashed whale"));
        assert!(!system.contains("locked whale"));
    }
}

#[tokio::test]
async fn anthropic_accepts_a_gateway_requiring_bearer_auth() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/v1", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let (headers, _) = read_request(&mut socket).await;
        assert!(headers.contains("x-api-key: mock-key"));
        socket
            .write_all(
                b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            )
            .await
            .unwrap();

        let (mut socket, _) = listener.accept().await.unwrap();
        let (headers, _) = read_request(&mut socket).await;
        assert!(headers.contains("authorization: Bearer mock-key"));
        assert!(!headers.contains("x-api-key:"));
        assert!(headers.contains("anthropic-version: 2023-06-01"));
        let body = r#"{"content":[{"type":"text","text":"OK"}]}"#;
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        socket.write_all(response.as_bytes()).await.unwrap();
    });

    let data = tempdir().unwrap();
    let app = AppService::open(data.path()).unwrap();
    let reply = timeout(
        Duration::from_secs(3),
        app.test_ai_connection(Some(config(AiProtocol::Anthropic, url))),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(reply, "OK");
    server.await.unwrap();
}

#[tokio::test]
async fn provider_output_and_errors_do_not_reflect_the_api_key() {
    let data = tempdir().unwrap();
    let app = AppService::open(data.path()).unwrap();
    let (url, server) = mock_server(
        concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"key: mock-\",\"reasoning\":\"mock-\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"key\",\"reasoning\":\"key\"}}]}\n\n",
            "event: error\ndata: {\"error\":{\"message\":\"mock-key\"}}\n\n",
        ),
        "text/event-stream", false,
    ).await;
    app.set_ai_config(config(AiProtocol::Openai, url)).unwrap();
    let mut events = Vec::new();
    app.stream_chat(chat_request(), |event| {
        events.push(event);
        Ok(())
    })
    .await
    .unwrap();
    let text: String = events
        .iter()
        .filter_map(|event| match event {
            ChatStreamEvent::Chunk { delta } => Some(delta.as_str()),
            _ => None,
        })
        .collect();
    let thinking: String = events
        .iter()
        .filter_map(|event| match event {
            ChatStreamEvent::Thinking { delta } => Some(delta.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(text, "key: [redacted]");
    assert_eq!(thinking, "[redacted]");
    assert!(
        matches!(events.last(), Some(ChatStreamEvent::Error { message }) if !message.contains("mock-key"))
    );
    server.await.unwrap();
}
