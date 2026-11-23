use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension, Params, Row, TransactionBehavior};
use serde::Serialize;
use uuid::Uuid;

use crate::{notes::SUMMARY_COLUMNS, AppError, AppService, NoteSummary};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagData {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub note_count: i64,
    pub is_pinned: bool,
    pub sort_order: i64,
}

impl TagData {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            parent_id: row.get("parent_id")?,
            note_count: row.get("note_count")?,
            is_pinned: row.get("is_pinned")?,
            sort_order: row.get("sort_order")?,
        })
    }
}

impl AppService {
    pub fn list_tags(&self) -> Result<Vec<TagData>, AppError> {
        let conn = self.database.get()?;
        query_tags(&conn, "", [])
    }

    pub fn get_tags_by_note_id(&self, note_id: &str) -> Result<Vec<TagData>, AppError> {
        let conn = self.database.get()?;
        query_tags(
            &conn,
            "WHERE tags.id IN (SELECT tag_id FROM note_tags WHERE note_id = ?1)",
            [note_id],
        )
    }

    pub fn get_notes_by_tag(&self, tag_id: &str) -> Result<Vec<NoteSummary>, AppError> {
        let conn = self.database.get()?;
        let mut statement = conn.prepare_cached(&format!(
            "SELECT {SUMMARY_COLUMNS} FROM note_tags
             JOIN notes ON notes.id = note_tags.note_id
             WHERE note_tags.tag_id = ?1 AND notes.is_trashed = 0
             ORDER BY is_pinned DESC, updated_at DESC, id"
        ))?;
        let notes = statement
            .query_map([tag_id], NoteSummary::from_row)?
            .collect::<rusqlite::Result<_>>()?;
        Ok(notes)
    }

    pub fn set_note_tags(&self, note_id: &str, tag_names: &[String]) -> Result<(), AppError> {
        let mut conn = self.database.get()?;
        let transaction = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        ensure_note_exists(&transaction, note_id)?;
        transaction.execute("DELETE FROM note_tags WHERE note_id = ?1", [note_id])?;
        for tag_name in tag_names {
            attach_tag(&transaction, note_id, tag_name)?;
        }
        delete_unused_tags(&transaction)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn add_note_tag(&self, note_id: &str, tag_name: &str) -> Result<(), AppError> {
        let mut conn = self.database.get()?;
        let transaction = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        ensure_note_exists(&transaction, note_id)?;
        attach_tag(&transaction, note_id, tag_name)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn remove_note_tag(&self, note_id: &str, tag_id: &str) -> Result<(), AppError> {
        let mut conn = self.database.get()?;
        let transaction = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute(
            "DELETE FROM note_tags WHERE note_id = ?1 AND tag_id = ?2",
            params![note_id, tag_id],
        )?;
        delete_unused_tags(&transaction)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn cleanup_unused_tags(&self) -> Result<(), AppError> {
        let conn = self.database.get()?;
        delete_unused_tags(&conn)
    }

    pub fn toggle_tag_pin(&self, tag_id: &str) -> Result<bool, AppError> {
        let pinned = self
            .database
            .get()?
            .query_row(
                "UPDATE tags SET is_pinned = NOT is_pinned WHERE id = ?1 RETURNING is_pinned",
                [tag_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(pinned.unwrap_or(false))
    }

    pub fn reorder_tags(&self, ordered_ids: &[String]) -> Result<(), AppError> {
        let Some(first_id) = ordered_ids.first() else {
            return Ok(());
        };
        if ordered_ids.iter().collect::<HashSet<_>>().len() != ordered_ids.len() {
            return Err(AppError::InvalidTagOrder);
        }
        let mut conn = self.database.get()?;
        let transaction = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let parent_id: Option<String> = transaction
            .query_row(
                "SELECT parent_id FROM tags WHERE id = ?1",
                [first_id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or(AppError::InvalidTagOrder)?;
        {
            let mut update = transaction
                .prepare("UPDATE tags SET sort_order = ?1 WHERE id = ?2 AND parent_id IS ?3")?;
            for (position, id) in (0_i64..).zip(ordered_ids) {
                if update.execute(params![position, id, parent_id])? == 0 {
                    return Err(AppError::InvalidTagOrder);
                }
            }
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn rename_tag(&self, tag_id: &str, new_name: &str) -> Result<Option<String>, AppError> {
        let new_name = normalize_name(new_name)?;
        let mut conn = self.database.get()?;
        let transaction = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let old_name: Option<String> = transaction
            .query_row("SELECT name FROM tags WHERE id = ?1", [tag_id], |row| {
                row.get(0)
            })
            .optional()?;
        let Some(old_name) = old_name else {
            return Ok(None);
        };
        if parent_path(&old_name) != parent_path(&new_name) {
            return Err(AppError::InvalidTagRename);
        }
        // In binary order, '0' follows '/'. This range covers only descendant paths.
        transaction
            .execute(
                "UPDATE tags SET name = ?1 || substr(name, length(?2) + 1)
                 WHERE id = ?3 OR (name >= ?2 || '/' AND name < ?2 || '0')",
                params![new_name, old_name, tag_id],
            )
            .map_err(|error| match error {
                rusqlite::Error::SqliteFailure(details, _)
                    if details.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE =>
                {
                    AppError::TagNameTaken
                }
                _ => AppError::from(error),
            })?;
        transaction.commit()?;
        Ok(Some(old_name))
    }

    pub fn delete_tag(&self, tag_id: &str) -> Result<Vec<String>, AppError> {
        let mut conn = self.database.get()?;
        let transaction = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let note_ids = {
            let mut statement = transaction
                .prepare("SELECT note_id FROM note_tags WHERE tag_id = ?1 ORDER BY note_id")?;
            let rows = statement.query_map([tag_id], |row| row.get(0))?;
            rows.collect::<rusqlite::Result<_>>()?
        };
        transaction.execute(
            "UPDATE tags SET parent_id = NULL WHERE parent_id = ?1",
            [tag_id],
        )?;
        transaction.execute("DELETE FROM tags WHERE id = ?1", [tag_id])?;
        delete_unused_tags(&transaction)?;
        transaction.commit()?;
        Ok(note_ids)
    }
}

pub(crate) fn delete_unused_tags(conn: &Connection) -> Result<(), AppError> {
    conn.execute(
        "WITH RECURSIVE used(id) AS (
             SELECT tag_id FROM note_tags
             UNION
             SELECT tags.parent_id FROM tags JOIN used ON tags.id = used.id
             WHERE tags.parent_id IS NOT NULL
         )
         DELETE FROM tags WHERE id NOT IN (SELECT id FROM used)",
        [],
    )?;
    Ok(())
}

fn query_tags(
    conn: &Connection,
    filter: &str,
    params: impl Params,
) -> Result<Vec<TagData>, AppError> {
    let mut statement = conn.prepare_cached(&format!(
        "SELECT tags.id, tags.name, tags.parent_id, count(active.id) AS note_count,
                tags.is_pinned, tags.sort_order
         FROM tags
         LEFT JOIN note_tags ON note_tags.tag_id = tags.id
         LEFT JOIN notes AS active ON active.id = note_tags.note_id AND active.is_trashed = 0
         {filter}
         GROUP BY tags.id
         ORDER BY tags.is_pinned DESC, tags.sort_order, tags.name"
    ))?;
    let tags = statement
        .query_map(params, TagData::from_row)?
        .collect::<rusqlite::Result<_>>()?;
    Ok(tags)
}

fn ensure_note_exists(conn: &Connection, note_id: &str) -> Result<(), AppError> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM notes WHERE id = ?1)",
        [note_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(AppError::NoteNotFound);
    }
    Ok(())
}

fn normalize_name(name: &str) -> Result<String, AppError> {
    let parts: Vec<_> = name
        .trim()
        .trim_start_matches('#')
        .split('/')
        .map(str::trim)
        .collect();
    if parts
        .iter()
        .any(|part| part.is_empty() || part.chars().any(char::is_control))
    {
        return Err(AppError::InvalidTagName);
    }
    Ok(parts.join("/"))
}

fn parent_path(name: &str) -> Option<&str> {
    name.rsplit_once('/').map(|(parent, _)| parent)
}

fn attach_tag(conn: &Connection, note_id: &str, tag_name: &str) -> Result<(), AppError> {
    let tag_name = normalize_name(tag_name)?;
    let mut id: Option<String> = None;
    for name in tag_name
        .match_indices('/')
        .map(|(end, _)| &tag_name[..end])
        .chain(std::iter::once(tag_name.as_str()))
    {
        let new_id = Uuid::new_v4().to_string();
        let tag_id: String = conn.query_row(
            "INSERT INTO tags (id, name, parent_id) VALUES (?1, ?2, ?3)
             ON CONFLICT(name) DO UPDATE SET parent_id = excluded.parent_id
             RETURNING id",
            params![new_id, name, id],
            |row| row.get(0),
        )?;
        if tag_id == new_id {
            conn.execute(
                "UPDATE tags SET parent_id = ?1
                 WHERE parent_id IS NULL AND name >= ?2 || '/' AND name < ?2 || '0'
                   AND instr(substr(name, length(?2) + 2), '/') = 0",
                params![tag_id, name],
            )?;
        }
        id = Some(tag_id);
    }
    conn.execute(
        "INSERT INTO note_tags (note_id, tag_id) VALUES (?1, ?2)
         ON CONFLICT(note_id, tag_id) DO NOTHING",
        params![note_id, id],
    )?;
    Ok(())
}
