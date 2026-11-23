use std::fmt::Write;

use rusqlite::Row;

use crate::{AppError, AppService};

use super::NoteSource;

const SOURCE_LIMIT: usize = 8;
const KEYWORD_LIMIT: usize = 32;
const EXCERPT_LIMIT: usize = 1200;

struct Match {
    source: NoteSource,
    excerpt: String,
}

impl Match {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            source: NoteSource {
                id: row.get(0)?,
                title: row.get(1)?,
            },
            excerpt: row.get(2)?,
        })
    }
}

fn is_han(character: char) -> bool {
    matches!(character, '\u{3400}'..='\u{4dbf}' | '\u{4e00}'..='\u{9fff}')
}

fn keywords(question: &str) -> (Vec<&str>, Vec<String>) {
    let mut terms = Vec::new();
    for word in question.split(|character: char| !character.is_alphanumeric()) {
        if word.chars().take(2).count() == 2 && !terms.contains(&word) {
            terms.push(word);
            if terms.len() == KEYWORD_LIMIT {
                break;
            }
        }
    }

    // unicode61 does not segment Chinese sentences. Supplement FTS with Han bigrams.
    let mut han = Vec::new();
    for run in question.split(|character: char| !is_han(character)) {
        let chars = run.chars().collect::<Vec<_>>();
        for pair in chars.windows(2) {
            let term: String = pair.iter().collect();
            if !han.contains(&term)
                && !["什么", "哪里", "如何", "怎么", "请问", "笔记"].contains(&term.as_str())
            {
                han.push(term);
                if han.len() == KEYWORD_LIMIT {
                    return (terms, han);
                }
            }
        }
    }
    (terms, han)
}

impl AppService {
    pub(super) fn retrieve_chat_context(
        &self,
        question: &str,
    ) -> Result<(String, Vec<NoteSource>), AppError> {
        let (terms, han) = keywords(question);
        let conn = self.database.get()?;
        let mut matches = Vec::new();
        if !terms.is_empty() {
            let query = terms
                .iter()
                .map(|term| format!("\"{term}\""))
                .collect::<Vec<_>>()
                .join(" OR ");
            let mut statement = conn.prepare(
                "SELECT n.id, n.title, snippet(notes_fts, 1, '', '', ' … ', 64)
                 FROM notes_fts JOIN notes n ON n.rowid = notes_fts.rowid
                 WHERE notes_fts MATCH ?1 AND n.is_trashed = 0 AND n.is_locked = 0
                 ORDER BY bm25(notes_fts, 4.0, 1.0), n.updated_at DESC LIMIT ?2",
            )?;
            matches = statement
                .query_map((query, SOURCE_LIMIT as i64), Match::from_row)?
                .collect::<Result<_, _>>()?;
        }
        if !han.is_empty() && matches.len() < SOURCE_LIMIT {
            let han = serde_json::to_string(&han).expect("string array is serializable");
            let mut statement = conn.prepare(
                "WITH hits AS (
                    SELECT n.rowid AS note_row, j.value AS term,
                           instr(n.title, j.value) AS in_title,
                           instr(n.content_text, j.value) AS in_body
                    FROM notes n CROSS JOIN json_each(?1) j
                    WHERE n.is_trashed = 0 AND n.is_locked = 0
                 ), ranked AS (
                    SELECT note_row, SUM((in_title > 0)*4 + (in_body > 0)) AS score,
                           MIN(NULLIF(in_body, 0)) AS position
                    FROM hits WHERE in_title > 0 OR in_body > 0 GROUP BY note_row
                 )
                 SELECT n.id, n.title, substr(n.content_text, max(1, coalesce(r.position, 1)-240), ?2)
                 FROM ranked r JOIN notes n ON n.rowid = r.note_row
                 ORDER BY r.score DESC, n.updated_at DESC LIMIT ?3",
            )?;
            for result in statement.query_map(
                (han, EXCERPT_LIMIT as i64, SOURCE_LIMIT as i64),
                Match::from_row,
            )? {
                let result = result?;
                if !matches
                    .iter()
                    .any(|found| found.source.id == result.source.id)
                {
                    matches.push(result);
                    if matches.len() == SOURCE_LIMIT {
                        break;
                    }
                }
            }
        }

        let mut context = String::new();
        let mut sources = Vec::new();
        for result in matches {
            let title: String = result.source.title.chars().take(200).collect();
            let excerpt: String = result.excerpt.chars().take(EXCERPT_LIMIT).collect();
            let _ = writeln!(context, "<note>\nTitle: {title}\n{excerpt}\n</note>");
            sources.push(result.source);
        }
        Ok((context, sources))
    }
}
