use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::LazyLock,
};

use regex::Regex;
use serde::Serialize;
use uuid::Uuid;

use crate::{notes::SUMMARY_COLUMNS, AppError, AppService, NoteSummary};

pub(crate) const IMPORT_EXTENSIONS: &[&str] = &["md", "markdown", "txt", "html", "htm"];

#[derive(Default, Serialize)]
pub struct ImportResult {
    pub created: Vec<NoteSummary>,
    pub failed: Vec<ImportFailure>,
}

#[derive(Serialize)]
pub struct ImportFailure {
    pub name: String,
    pub error: String,
}

impl AppService {
    pub fn import_files(&self, paths: impl IntoIterator<Item = PathBuf>) -> ImportResult {
        let mut result = ImportResult::default();
        for path in paths {
            match self.import_file(&path) {
                Ok(note) => result.created.push(note),
                Err(error) => result.failed.push(ImportFailure {
                    name: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned(),
                    error: error.to_string(),
                }),
            }
        }
        result
    }

    pub fn save_export(destination: Option<&Path>, content: &str) -> Result<bool, AppError> {
        let Some(destination) = destination else {
            return Ok(false);
        };
        let directory = destination
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        let mut file = tempfile::NamedTempFile::new_in(directory).map_err(AppError::ExportWrite)?;
        file.write_all(content.as_bytes())
            .map_err(AppError::ExportWrite)?;
        file.persist(destination)
            .map_err(|error| AppError::ExportWrite(error.error))?;
        Ok(true)
    }

    fn import_file(&self, path: &Path) -> Result<NoteSummary, AppError> {
        let extension = path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or_default();
        let extension = IMPORT_EXTENSIONS
            .iter()
            .copied()
            .find(|candidate| candidate.eq_ignore_ascii_case(extension))
            .ok_or(AppError::ImportExtension)?;
        let content = fs::read_to_string(path).map_err(AppError::ImportRead)?;
        let content = if matches!(extension, "html" | "htm") {
            htmd::HtmlToMarkdown::builder()
                .skip_tags(vec!["head", "script", "style", "template"])
                .build()
                .convert(&content)
                .map_err(AppError::ImportHtml)?
        } else {
            content
        };
        let title = path.file_stem().unwrap_or_default().to_string_lossy();
        let content_text = markdown_plain_text(&content);
        // Insert title and body together so a failed import cannot leave a blank note.
        let query = format!(
            "INSERT INTO notes(id, title, content, content_text) VALUES (?1, ?2, ?3, ?4)
             RETURNING {SUMMARY_COLUMNS}"
        );
        Ok(self.database.get()?.query_row(
            &query,
            rusqlite::params![Uuid::new_v4().to_string(), title, content, content_text],
            NoteSummary::from_row,
        )?)
    }
}

fn markdown_plain_text(markdown: &str) -> String {
    // Match the index text produced when the renderer saves an edited note.
    static RULES: LazyLock<Vec<(Regex, &str)>> = LazyLock::new(|| {
        [
            (r"(?s)```.*?```", " "),
            (r"`[^`]*`", " "),
            (r"!\[[^\]]*\]\([^)]*\)", " "),
            (r"\[([^\]]+)\]\([^)]*\)", "$1"),
            (r"(?m)^#{1,6}\s+", ""),
            (r"(?m)^\s*[-*+]\s+", ""),
            (r"(?m)^\s*\d+\.\s+", ""),
            (r"(?m)^\s*>\s?", ""),
            (r"\*\*([^*]+)\*\*", "$1"),
            (r"\*([^*]+)\*", "$1"),
            (r"~~([^~]+)~~", "$1"),
            (r"(?m)^-{3,}\s*$", " "),
        ]
        .into_iter()
        .map(|(pattern, replacement)| {
            (
                Regex::new(pattern).expect("valid Markdown pattern"),
                replacement,
            )
        })
        .collect()
    });
    let mut text = std::borrow::Cow::Borrowed(markdown);
    for (pattern, replacement) in RULES.iter() {
        if let std::borrow::Cow::Owned(replaced) = pattern.replace_all(&text, *replacement) {
            text = std::borrow::Cow::Owned(replaced);
        }
    }
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}
