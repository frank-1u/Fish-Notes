use rusqlite::{params, Row, TransactionBehavior};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{AppError, AppService};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    User,
    Assistant,
}

impl ChatRole {
    fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Assistant => "assistant",
        }
    }
}

#[derive(Deserialize, Serialize)]
pub struct Message {
    pub role: ChatRole,
    pub content: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatData {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

impl ChatData {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            title: row.get("title")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageData {
    pub id: String,
    pub chat_id: String,
    pub role: ChatRole,
    pub content: String,
    pub note_id: Option<String>,
    pub created_at: String,
}

impl ChatMessageData {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        let role = match row.get_ref("role")?.as_str()? {
            "user" => ChatRole::User,
            "assistant" => ChatRole::Assistant,
            _ => return Err(rusqlite::Error::InvalidQuery),
        };
        Ok(Self {
            id: row.get("id")?,
            chat_id: row.get("chat_id")?,
            role,
            content: row.get("content")?,
            note_id: row.get("note_id")?,
            created_at: row.get("created_at")?,
        })
    }
}

impl AppService {
    pub fn create_chat(&self, title: Option<&str>) -> Result<ChatData, AppError> {
        let conn = self.database.get()?;
        Ok(conn.query_row(
            "INSERT INTO chats (id, title) VALUES (?1, ?2) RETURNING *",
            params![Uuid::new_v4().to_string(), title.unwrap_or_default()],
            ChatData::from_row,
        )?)
    }

    pub fn list_chats(&self) -> Result<Vec<ChatData>, AppError> {
        let conn = self.database.get()?;
        let mut query = conn.prepare("SELECT * FROM chats ORDER BY updated_at DESC, rowid DESC")?;
        let chats = query
            .query_map([], ChatData::from_row)?
            .collect::<Result<_, _>>()?;
        Ok(chats)
    }

    pub fn get_chat_messages(&self, chat_id: &str) -> Result<Vec<ChatMessageData>, AppError> {
        let conn = self.database.get()?;
        let mut query =
            conn.prepare("SELECT * FROM chat_messages WHERE chat_id = ?1 ORDER BY rowid")?;
        let messages = query
            .query_map([chat_id], ChatMessageData::from_row)?
            .collect::<Result<_, _>>()?;
        Ok(messages)
    }

    pub fn add_chat_message(
        &self,
        chat_id: &str,
        role: ChatRole,
        content: &str,
        note_id: Option<&str>,
    ) -> Result<ChatMessageData, AppError> {
        let mut conn = self.database.get()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let changed = tx.execute(
            "UPDATE chats SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                 title = CASE WHEN title = '' AND ?2 = 'user' THEN substr(?3, 1, 24) ELSE title END
             WHERE id = ?1",
            params![chat_id, role.as_str(), content],
        )?;
        if changed == 0 {
            return Err(AppError::ChatNotFound);
        }
        let message = tx.query_row(
            "INSERT INTO chat_messages (id, chat_id, role, content, note_id)
             VALUES (?1, ?2, ?3, ?4, ?5) RETURNING *",
            params![
                Uuid::new_v4().to_string(),
                chat_id,
                role.as_str(),
                content,
                note_id
            ],
            ChatMessageData::from_row,
        )?;
        tx.commit()?;
        Ok(message)
    }

    pub fn delete_chat(&self, id: &str) -> Result<(), AppError> {
        self.database
            .get()?
            .execute("DELETE FROM chats WHERE id = ?1", [id])?;
        Ok(())
    }
}
