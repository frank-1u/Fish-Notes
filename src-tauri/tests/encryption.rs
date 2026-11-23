use fish_notes::{AppError, AppService, NoteUpdate};
use rusqlite::Connection;
use tempfile::tempdir;

#[test]
fn password_persists_but_unlocked_session_does_not() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    assert!(!app.has_password().unwrap());
    assert!(!app.is_unlocked().unwrap());
    assert!(!app.verify_password("wrong password").unwrap());

    app.set_password("独立密码").unwrap();
    assert!(app.has_password().unwrap());
    assert!(app.is_unlocked().unwrap());
    assert!(app.set_password("replacement").is_err());
    drop(app);

    let reopened = AppService::open(directory.path()).unwrap();
    assert!(reopened.has_password().unwrap());
    assert!(!reopened.is_unlocked().unwrap());
    assert!(!reopened.verify_password("wrong password").unwrap());
    assert!(!reopened.is_unlocked().unwrap());
    assert!(reopened.verify_password("独立密码").unwrap());
    assert!(reopened.is_unlocked().unwrap());
}

#[test]
fn encrypted_note_edits_stay_encrypted_and_search_returns_after_decryption() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let id = app.create_note().unwrap().summary.id;
    app.update_note(
        &id,
        NoteUpdate {
            title: Some("searchabletitle".into()),
            content: Some("**originaltoken**".into()),
            content_text: Some("originaltoken".into()),
        },
    )
    .unwrap();
    assert!(matches!(app.lock_note(&id), Err(AppError::SessionLocked)));
    app.set_password("password").unwrap();

    // The database file is the persistence boundary. MATCH works before the search API exists.
    let db = Connection::open(directory.path().join("fish-notes.db")).unwrap();
    let matches = |term| {
        db.query_row(
            "SELECT count(*) FROM notes_fts WHERE notes_fts MATCH ?1",
            [term],
            |row| row.get::<_, i64>(0),
        )
        .unwrap()
    };
    assert_eq!(matches("searchabletitle"), 1);
    assert_eq!(matches("originaltoken"), 1);

    assert!(app.lock_note(&id).unwrap().is_locked);
    assert_eq!(matches("searchabletitle"), 0);
    assert_eq!(matches("originaltoken"), 0);
    assert_eq!(app.get_note(&id).unwrap().unwrap().content, "");
    assert_eq!(
        app.get_decrypted_note(&id).unwrap().content,
        "**originaltoken**"
    );

    let updated = app
        .update_note(
            &id,
            NoteUpdate {
                title: Some("revisedtitle".into()),
                content: Some("## editedtoken 🐟".into()),
                content_text: Some("editedtoken 🐟".into()),
            },
        )
        .unwrap();
    assert!(updated.is_locked);
    assert_eq!(updated.preview, "");
    let (stored_content, stored_text): (String, String) = db
        .query_row(
            "SELECT content, content_text FROM notes WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert!(!stored_content.is_empty());
    assert!(!stored_content.contains("editedtoken"));
    assert_eq!(stored_text, "");
    assert_eq!(matches("editedtoken"), 0);
    assert_eq!(matches("revisedtitle"), 0);
    assert_eq!(
        app.get_decrypted_note(&id).unwrap().content,
        "## editedtoken 🐟"
    );

    app.clone().lock_all().unwrap();
    assert!(!app.is_unlocked().unwrap());
    assert!(matches!(
        app.get_decrypted_note(&id),
        Err(AppError::SessionLocked)
    ));
    assert!(matches!(app.unlock_note(&id), Err(AppError::SessionLocked)));
    assert!(matches!(
        app.update_note(
            &id,
            NoteUpdate {
                content_text: Some("unauthorizedtoken".into()),
                ..NoteUpdate::default()
            },
        ),
        Err(AppError::SessionLocked)
    ));
    assert!(app.verify_password("password").unwrap());
    assert!(!app.unlock_note(&id).unwrap().is_locked);
    let decrypted = app.get_note(&id).unwrap().unwrap();
    assert_eq!(decrypted.content, "## editedtoken 🐟");
    assert_eq!(decrypted.content_text, "editedtoken 🐟");
    assert_eq!(matches("editedtoken"), 1);
    assert_eq!(matches("revisedtitle"), 1);
    assert_eq!(matches("originaltoken"), 0);
}

#[test]
fn changing_and_removing_the_password_updates_every_encrypted_note() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    app.set_password("original password").unwrap();

    let mut notes = Vec::new();
    for token in ["firstnote", "secondnote"] {
        let id = app.create_note().unwrap().summary.id;
        app.update_note(
            &id,
            NoteUpdate {
                content: Some(format!("**{token}**")),
                content_text: Some(token.into()),
                ..NoteUpdate::default()
            },
        )
        .unwrap();
        app.lock_note(&id).unwrap();
        notes.push((id, token));
    }
    app.trash_note(&notes[1].0).unwrap();
    let other_instance = AppService::open(directory.path()).unwrap();
    assert!(other_instance.verify_password("original password").unwrap());
    let unencrypted_id = app.create_note().unwrap().summary.id;

    assert!(!app
        .change_password("wrong password", "new password")
        .unwrap());
    assert!(app
        .change_password("original password", "new password")
        .unwrap());
    assert!(app.is_unlocked().unwrap());
    assert!(matches!(
        other_instance.lock_note(&unencrypted_id),
        Err(AppError::SessionLocked)
    ));
    assert!(!other_instance.is_unlocked().unwrap());
    drop(other_instance);
    drop(app);

    let app = AppService::open(directory.path()).unwrap();
    assert!(!app.verify_password("original password").unwrap());
    assert!(app.verify_password("new password").unwrap());
    for (id, token) in &notes {
        let note = app.get_decrypted_note(id).unwrap();
        assert!(note.summary.is_locked);
        assert_eq!(note.content, format!("**{token}**"));
    }

    app.lock_all().unwrap();
    assert!(!app.remove_password("original password").unwrap());
    assert!(app.has_password().unwrap());
    assert!(app.remove_password("new password").unwrap());
    assert!(!app.has_password().unwrap());
    assert!(!app.is_unlocked().unwrap());
    assert!(app.list_notes(true).unwrap()[0].is_trashed);

    let db = Connection::open(directory.path().join("fish-notes.db")).unwrap();
    for (id, token) in &notes {
        let note = app.get_note(id).unwrap().unwrap();
        assert!(!note.summary.is_locked);
        assert_eq!(note.content, format!("**{token}**"));
        assert_eq!(note.content_text, *token);
        let hits: i64 = db
            .query_row(
                "SELECT count(*) FROM notes_fts WHERE notes_fts MATCH ?1",
                [token],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(hits, 1);
    }
}

#[test]
fn failed_credential_write_rolls_back_reencryption() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    app.set_password("original password").unwrap();
    let id = app.create_note().unwrap().summary.id;
    app.update_note(
        &id,
        NoteUpdate {
            content: Some("**keep my note**".into()),
            content_text: Some("keep my note".into()),
            ..NoteUpdate::default()
        },
    )
    .unwrap();
    app.lock_note(&id).unwrap();

    let db = Connection::open(directory.path().join("fish-notes.db")).unwrap();
    db.execute_batch(
        "CREATE TRIGGER fail_credential_update BEFORE UPDATE ON app_settings
         BEGIN SELECT RAISE(ABORT, 'simulated credential write failure'); END;",
    )
    .unwrap();
    assert!(matches!(
        app.change_password("original password", "new password"),
        Err(AppError::Sqlite(_))
    ));
    assert_eq!(
        app.get_decrypted_note(&id).unwrap().content,
        "**keep my note**"
    );
    app.lock_all().unwrap();
    assert!(app.verify_password("original password").unwrap());
    assert!(!app.verify_password("new password").unwrap());
    assert_eq!(
        app.get_decrypted_note(&id).unwrap().content,
        "**keep my note**"
    );
}

#[test]
fn opening_a_database_with_the_previous_index_preserves_searchable_notes() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let id = app.create_note().unwrap().summary.id;
    let locked_id = app.create_note().unwrap().summary.id;
    app.update_note(
        &id,
        NoteUpdate {
            title: Some("publictitle".into()),
            content_text: Some("publictext".into()),
            ..NoteUpdate::default()
        },
    )
    .unwrap();
    drop(app);

    let db = Connection::open(directory.path().join("fish-notes.db")).unwrap();
    db.execute_batch(
        "DROP TRIGGER notes_ai;
         DROP TRIGGER notes_ad;
         DROP TRIGGER notes_au;
         DROP TABLE notes_fts;
         DROP VIEW notes_fts_content;
         CREATE VIRTUAL TABLE notes_fts USING fts5(
             title, content_text, content = 'notes', content_rowid = 'rowid'
         );",
    )
    .unwrap();
    db.execute(
        "UPDATE notes SET title = 'lockedtitle', is_locked = 1 WHERE id = ?1",
        [&locked_id],
    )
    .unwrap();
    db.execute("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild')", [])
        .unwrap();
    let matches = |term| {
        db.query_row(
            "SELECT count(*) FROM notes_fts WHERE notes_fts MATCH ?1",
            [term],
            |row| row.get::<_, i64>(0),
        )
        .unwrap()
    };
    assert_eq!(matches("lockedtitle"), 1);
    let _app = AppService::open(directory.path()).unwrap();
    assert_eq!(matches("lockedtitle"), 0);
    assert_eq!(matches("publictitle"), 1);
    assert_eq!(matches("publictext"), 1);
}
