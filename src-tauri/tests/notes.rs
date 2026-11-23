use fish_notes::{AppService, NoteUpdate};
use rusqlite::Connection;
use tempfile::tempdir;

#[test]
fn created_note_is_retrievable_after_reopening_the_database() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let created = app.create_note().unwrap();
    assert!(created.summary.title.is_empty());
    assert!(created.content.is_empty());
    assert!(!created.summary.is_trashed);
    drop(app);

    let reopened = AppService::open(directory.path()).unwrap();
    assert_eq!(
        reopened.get_note(&created.summary.id).unwrap(),
        Some(created)
    );
}

#[test]
fn list_returns_a_bounded_preview_and_get_returns_the_full_markdown() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let id = app.create_note().unwrap().summary.id;
    let plain_text = "鱼".repeat(120);
    let markdown = format!("# {plain_text}");
    app.update_note(
        &id,
        NoteUpdate {
            title: Some("Draft".into()),
            content: Some(markdown.clone()),
            content_text: Some(plain_text.clone()),
        },
    )
    .unwrap();

    let list = app.list_notes(false).unwrap();
    assert_eq!(list.len(), 1);
    let summary = serde_json::to_value(&list[0]).unwrap();
    assert_eq!(summary["id"], id);
    assert_eq!(summary["title"], "Draft");
    assert_eq!(summary["preview"], "鱼".repeat(80));
    assert!(summary.get("content").is_none());
    assert!(summary.get("contentText").is_none());

    let note = app.get_note(&id).unwrap().unwrap();
    assert_eq!(note.content, markdown);
    assert_eq!(note.content_text, plain_text);
}

#[test]
fn note_can_be_pinned_trashed_restored_and_permanently_deleted() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let id = app.create_note().unwrap().summary.id;
    let other_id = app.create_note().unwrap().summary.id;

    assert!(app.toggle_note_pin(&id).unwrap());
    assert_eq!(app.list_notes(false).unwrap()[0].id, id);
    assert!(!app.toggle_note_pin(&id).unwrap());

    app.trash_note(&id).unwrap();
    assert_eq!(app.list_notes(false).unwrap()[0].id, other_id);
    let trash = app.list_notes(true).unwrap();
    assert_eq!(trash.len(), 1);
    assert_eq!(trash[0].id, id);
    assert!(trash[0].is_trashed);

    app.restore_note(&id).unwrap();
    assert!(app.list_notes(true).unwrap().is_empty());
    assert_eq!(app.list_notes(false).unwrap().len(), 2);

    app.trash_note(&id).unwrap();
    app.delete_note_permanently(&id).unwrap();
    assert!(app.get_note(&id).unwrap().is_none());
    assert!(app.list_notes(true).unwrap().is_empty());
}

#[test]
fn fts_tracks_title_and_plain_text_without_rewriting_on_other_updates() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let id = app.create_note().unwrap().summary.id;
    let connection = Connection::open(directory.path().join("fish-notes.db")).unwrap();
    let matches = |term| {
        connection
            .query_row(
                "SELECT count(*) FROM notes_fts WHERE notes_fts MATCH ?1",
                [term],
                |row| row.get::<_, u32>(0),
            )
            .unwrap()
    };
    let index_pages = || {
        // Equal MATCH results alone would also pass if metadata updates rebuilt the index.
        connection
            .prepare("SELECT id, block FROM notes_fts_data ORDER BY id")
            .unwrap()
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, Vec<u8>>(1)?))
            })
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap()
    };

    app.update_note(
        &id,
        NoteUpdate {
            title: Some("initial".into()),
            content: Some("**markdownonly**".into()),
            content_text: Some("firsttext".into()),
        },
    )
    .unwrap();
    assert_eq!(matches("initial"), 1);
    assert_eq!(matches("firsttext"), 1);
    assert_eq!(matches("markdownonly"), 0);

    let before = index_pages();
    app.toggle_note_pin(&id).unwrap();
    app.trash_note(&id).unwrap();
    app.restore_note(&id).unwrap();
    app.update_note(
        &id,
        NoteUpdate {
            content: Some("*markdownonly*".into()),
            ..NoteUpdate::default()
        },
    )
    .unwrap();
    assert_eq!(index_pages(), before);

    app.update_note(
        &id,
        NoteUpdate {
            title: Some("revised".into()),
            ..NoteUpdate::default()
        },
    )
    .unwrap();
    assert_eq!(matches("initial"), 0);
    assert_eq!(matches("revised"), 1);
    assert_eq!(matches("firsttext"), 1);
    app.update_note(
        &id,
        NoteUpdate {
            content_text: Some("replacement".into()),
            ..NoteUpdate::default()
        },
    )
    .unwrap();
    assert_eq!(matches("firsttext"), 0);
    assert_eq!(matches("replacement"), 1);

    app.delete_note_permanently(&id).unwrap();
    assert_eq!(matches("revised"), 0);
    assert_eq!(matches("replacement"), 0);
}
