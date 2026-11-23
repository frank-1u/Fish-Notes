use rusqlite::params;
use serde::Serialize;
use uuid::Uuid;

use crate::{AppError, AppService};

const SEARCH_LIMIT: u32 = 50;
const SNIPPET_CHAR_LIMIT: usize = 320;

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub snippet: Vec<SnippetPart>,
}

#[derive(Debug, Serialize)]
pub struct SnippetPart {
    pub text: String,
    pub matched: bool,
}

impl AppService {
    pub fn search_notes(&self, query: &str) -> Result<Vec<SearchResult>, AppError> {
        let query = query
            .split(|c: char| c.is_whitespace() || c == '\0')
            .filter(|word| word.chars().any(char::is_alphanumeric))
            .map(|word| format!("\"{}\"*", word.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" ");
        if query.is_empty() {
            return Ok(Vec::new());
        }

        // A fresh delimiter distinguishes FTS matches from punctuation in the note.
        let delimiter = Uuid::new_v4().to_string();
        let conn = self.database.get()?;
        let mut statement = conn.prepare_cached(
            "SELECT notes.id, notes.title, snippet(notes_fts, -1, ?2, ?2, '…', 24) AS snippet
             FROM notes_fts JOIN notes ON notes.rowid = notes_fts.rowid
             WHERE notes_fts MATCH ?1 AND notes.is_trashed = 0 AND notes.is_locked = 0
             ORDER BY bm25(notes_fts), notes.updated_at DESC, notes.id
             LIMIT ?3",
        )?;
        let results = statement
            .query_map(params![query, delimiter, SEARCH_LIMIT], |row| {
                let snippet: String = row.get("snippet")?;
                Ok(SearchResult {
                    id: row.get("id")?,
                    title: row.get("title")?,
                    snippet: split_snippet(&snippet, &delimiter),
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        Ok(results)
    }
}

fn split_snippet(snippet: &str, delimiter: &str) -> Vec<SnippetPart> {
    let mut parts = Vec::new();
    let mut remaining = SNIPPET_CHAR_LIMIT;
    for (index, text) in snippet.split(delimiter).enumerate() {
        if text.is_empty() {
            continue;
        }
        let matched = index % 2 != 0;
        // A single FTS token can be long, even though snippet() limits the token count.
        if let Some((end, _)) = text.char_indices().nth(remaining) {
            if end > 0 {
                parts.push(SnippetPart {
                    text: text[..end].into(),
                    matched,
                });
            }
            parts.push(SnippetPart {
                text: "…".into(),
                matched: false,
            });
            break;
        }
        remaining -= text.chars().count();
        parts.push(SnippetPart {
            text: text.into(),
            matched,
        });
    }
    parts
}
