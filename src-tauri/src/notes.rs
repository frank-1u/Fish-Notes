use rusqlite::{OptionalExtension, Row, ToSql, TransactionBehavior};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{tags::delete_unused_tags, AppError, AppService};

pub(crate) const SUMMARY_COLUMNS: &str =
    "id, title, CASE WHEN is_locked THEN '' ELSE substr(content_text, 1, 80) END AS preview,
     created_at, updated_at, is_trashed, is_pinned, is_locked";
const UPDATED_NOW: &str = "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub preview: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_trashed: bool,
    pub is_pinned: bool,
    pub is_locked: bool,
}

impl NoteSummary {
    pub(crate) fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            title: row.get("title")?,
            preview: row.get("preview")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            is_trashed: row.get("is_trashed")?,
            is_pinned: row.get("is_pinned")?,
            is_locked: row.get("is_locked")?,
        })
    }
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteData {
    #[serde(flatten)]
    pub summary: NoteSummary,
    pub content: String,
    pub content_text: String,
}

impl NoteData {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            summary: NoteSummary::from_row(row)?,
            content: row.get("content")?,
            content_text: row.get("content_text")?,
        })
    }
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteUpdate {
    pub title: Option<String>,
    pub content: Option<String>,
    pub content_text: Option<String>,
}

impl AppService {
    pub fn create_note(&self) -> Result<NoteData, AppError> {
        let query = format!(
            "INSERT INTO notes(id) VALUES (?1) RETURNING {SUMMARY_COLUMNS}, content, content_text"
        );
        Ok(self.database.get()?.query_row(
            &query,
            [Uuid::new_v4().to_string()],
            NoteData::from_row,
        )?)
    }

    pub fn get_note(&self, id: &str) -> Result<Option<NoteData>, AppError> {
        let query = format!(
            "SELECT {SUMMARY_COLUMNS}, CASE WHEN is_locked THEN '' ELSE content END AS content,
             CASE WHEN is_locked THEN '' ELSE content_text END AS content_text FROM notes WHERE id = ?1"
        );
        Ok(self
            .database
            .get()?
            .query_row(&query, [id], NoteData::from_row)
            .optional()?)
    }

    pub fn list_notes(&self, is_trashed: bool) -> Result<Vec<NoteSummary>, AppError> {
        let conn = self.database.get()?;
        let mut statement = conn.prepare_cached(&format!(
            "SELECT {SUMMARY_COLUMNS} FROM notes WHERE is_trashed = ?1
             ORDER BY is_pinned DESC, updated_at DESC, id"
        ))?;
        let notes = statement
            .query_map([is_trashed], NoteSummary::from_row)?
            .collect::<rusqlite::Result<_>>()?;
        Ok(notes)
    }

    pub fn update_note(&self, id: &str, data: NoteUpdate) -> Result<NoteSummary, AppError> {
        let mut assignments = Vec::new();
        let mut params: Vec<&dyn ToSql> = Vec::new();
        for (assignment, value) in [
            ("title = ?", &data.title),
            (
                "content = CASE WHEN is_locked THEN content ELSE ? END",
                &data.content,
            ),
            (
                "content_text = CASE WHEN is_locked THEN content_text ELSE ? END",
                &data.content_text,
            ),
        ] {
            if let Some(value) = value {
                assignments.push(assignment);
                params.push(value);
            }
        }

        let query = if assignments.is_empty() {
            format!("SELECT {SUMMARY_COLUMNS} FROM notes WHERE id = ?")
        } else {
            assignments.push(UPDATED_NOW);
            format!(
                "UPDATE notes SET {} WHERE id = ? RETURNING {SUMMARY_COLUMNS}",
                assignments.join(", ")
            )
        };
        params.push(&id);

        self.database
            .get()?
            .query_row(&query, params.as_slice(), NoteSummary::from_row)
            .optional()?
            .ok_or(AppError::NoteNotFound)
    }

    pub fn toggle_note_pin(&self, id: &str) -> Result<bool, AppError> {
        self.database
            .get()?
            .query_row(
                "UPDATE notes SET is_pinned = NOT is_pinned WHERE id = ?1 RETURNING is_pinned",
                [id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or(AppError::NoteNotFound)
    }

    pub fn trash_note(&self, id: &str) -> Result<(), AppError> {
        self.set_trashed(id, true)
    }

    pub fn restore_note(&self, id: &str) -> Result<(), AppError> {
        self.set_trashed(id, false)
    }

    fn set_trashed(&self, id: &str, is_trashed: bool) -> Result<(), AppError> {
        let changed = self.database.get()?.execute(
            &format!("UPDATE notes SET is_trashed = ?1, {UPDATED_NOW} WHERE id = ?2"),
            rusqlite::params![is_trashed, id],
        )?;
        if changed == 0 {
            return Err(AppError::NoteNotFound);
        }
        Ok(())
    }

    pub fn delete_note_permanently(&self, id: &str) -> Result<(), AppError> {
        let mut conn = self.database.get()?;
        let transaction = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute("DELETE FROM notes WHERE id = ?1", [id])?;
        delete_unused_tags(&transaction)?;
        transaction.commit()?;
        Ok(())
    }
}
