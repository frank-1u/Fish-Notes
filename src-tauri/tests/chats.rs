use fish_notes::{AppError, AppService, ChatRole};
use tempfile::tempdir;

#[test]
fn chats_and_ordered_messages_survive_reopening_and_delete_together() {
    let data = tempdir().unwrap();
    let app = AppService::open(data.path()).unwrap();
    let chat = app.create_chat(Some("Whales")).unwrap();
    let other = app.create_chat(None).unwrap();
    let question = app
        .add_chat_message(&chat.id, ChatRole::User, "Where?", Some("note-id"))
        .unwrap();
    let answer = app
        .add_chat_message(&chat.id, ChatRole::Assistant, "At sea.", None)
        .unwrap();
    drop(app);

    let app = AppService::open(data.path()).unwrap();
    let chats = app.list_chats().unwrap();
    assert_eq!(chats.len(), 2);
    assert_eq!(
        chats.iter().find(|item| item.id == chat.id).unwrap().title,
        "Whales"
    );
    assert_eq!(app.get_chat_messages(&chat.id).unwrap(), [question, answer]);
    assert_eq!(
        app.get_chat_messages(&chat.id).unwrap()[0]
            .note_id
            .as_deref(),
        Some("note-id")
    );

    app.delete_chat(&chat.id).unwrap();
    assert_eq!(app.list_chats().unwrap(), [other]);
    assert!(app.get_chat_messages(&chat.id).unwrap().is_empty());
    assert!(matches!(
        app.add_chat_message(&chat.id, ChatRole::User, "New", None),
        Err(AppError::ChatNotFound)
    ));
}
