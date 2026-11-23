use fish_notes::{AppService, NoteUpdate};
use rusqlite::Connection;
use tempfile::tempdir;

fn write_note(app: &AppService, title: &str, text: &str) -> String {
    let id = app.create_note().unwrap().summary.id;
    app.update_note(
        &id,
        NoteUpdate {
            title: Some(title.into()),
            content: Some(format!("**{text}**")),
            content_text: Some(text.into()),
        },
    )
    .unwrap();
    id
}

#[test]
fn search_ranks_relevant_notes_and_returns_highlighted_context_from_the_match() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let introduction = "intro sentence ".repeat(60);
    let relevant = write_note(
        &app,
        "Forests",
        &format!("{introduction} redwood redwood redwood grove"),
    );
    let less_relevant = write_note(
        &app,
        "Forests",
        &format!("{introduction} redwood pine spruce grove"),
    );
    let results = app.search_notes("redwo").unwrap();
    assert_eq!(results[0].id, relevant);
    assert_eq!(results[1].id, less_relevant);
    assert_eq!(results[0].title, "Forests");
    assert!(results[0]
        .snippet
        .iter()
        .any(|part| part.matched && part.text == "redwood"));
    let snippet: String = results[0]
        .snippet
        .iter()
        .map(|part| part.text.as_str())
        .collect();
    assert!(snippet.contains("grove"));
    assert!(snippet.len() < introduction.len());
    let payload = serde_json::to_value(&results[0]).unwrap();
    assert!(payload.get("content").is_none());
    assert!(payload.get("contentText").is_none());

    let title_results = app.search_notes("forests").unwrap();
    assert_eq!(title_results.len(), 2);
    assert!(title_results[0]
        .snippet
        .iter()
        .any(|part| part.matched && part.text == "Forests"));
}

#[test]
fn search_escapes_user_input_and_caps_results_and_long_snippets() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let quoted = write_note(&app, "Examples", "O'Neil wrote a Rust guide");
    let results = app.search_notes("(\"O'Neil\") & Rust*\0guide").unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, quoted);
    assert!(app.search_notes("  \" ) * ^ -- ").unwrap().is_empty());
    assert!(app.search_notes(" \n ").unwrap().is_empty());
    assert!(app
        .search_notes("title:Examples OR NEAR")
        .unwrap()
        .is_empty());

    for _ in 0..55 {
        write_note(&app, "Forests", "evergreen");
    }
    assert_eq!(app.search_notes("evergreen").unwrap().len(), 50);

    write_note(&app, "Long token", &"鱼".repeat(1000));
    let results = app.search_notes("鱼").unwrap();
    let snippet: String = results[0]
        .snippet
        .iter()
        .map(|part| part.text.as_str())
        .collect();
    assert!(snippet.chars().count() < 400);
    assert!(snippet.ends_with('…'));
}

#[test]
fn search_excludes_trashed_and_locked_notes_even_if_they_have_indexed_terms() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let visible = write_note(&app, "Public", "coral reef");
    let trashed = write_note(&app, "Trash", "coral reef");
    let locked = write_note(&app, "Private coral", "coral reef");
    app.trash_note(&trashed).unwrap();
    // Load a locked fixture while the encryption service is still under development.
    Connection::open(directory.path().join("fish-notes.db"))
        .unwrap()
        .execute(
            "UPDATE notes SET is_locked = 1, content_text = '' WHERE id = ?1",
            [&locked],
        )
        .unwrap();
    let results = app.search_notes("coral").unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, visible);
    app.restore_note(&trashed).unwrap();
    assert_eq!(app.search_notes("coral").unwrap().len(), 2);
}
