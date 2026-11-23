use fish_notes::AppService;
use tempfile::tempdir;

#[test]
fn nested_tags_are_counted_and_filter_active_note_summaries() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let first = app.create_note().unwrap().summary;
    let second = app.create_note().unwrap().summary;
    let unrelated = app.create_note().unwrap().summary;
    for note in [&first, &second] {
        app.set_note_tags(&note.id, &["#work/inbox".into(), "work/inbox".into()])
            .unwrap();
    }

    let tags = app.list_tags().unwrap();
    let parent = tags.iter().find(|tag| tag.name == "work").unwrap();
    let inbox = tags.iter().find(|tag| tag.name == "work/inbox").unwrap();
    assert_eq!(inbox.parent_id.as_deref(), Some(parent.id.as_str()));
    assert_eq!(parent.note_count, 0);
    assert_eq!(inbox.note_count, 2);
    assert_eq!(
        app.get_tags_by_note_id(&first.id).unwrap(),
        vec![inbox.clone()]
    );
    assert!(app.get_tags_by_note_id(&unrelated.id).unwrap().is_empty());
    assert!(app.get_notes_by_tag(&parent.id).unwrap().is_empty());

    app.trash_note(&second.id).unwrap();
    let summaries = app.get_notes_by_tag(&inbox.id).unwrap();
    assert_eq!(summaries, vec![first]);
    let projection = serde_json::to_value(&summaries[0]).unwrap();
    assert!(projection.get("content").is_none());
    assert!(projection.get("contentText").is_none());
    assert_eq!(
        app.get_tags_by_note_id(&second.id).unwrap()[0].note_count,
        1
    );

    app.restore_note(&second.id).unwrap();
    assert_eq!(app.get_notes_by_tag(&inbox.id).unwrap().len(), 2);
    assert_eq!(
        app.get_tags_by_note_id(&second.id).unwrap()[0].note_count,
        2
    );
}

#[test]
fn changing_one_binding_keeps_other_tags_and_cleans_unused_ancestors() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let note = app.create_note().unwrap().summary;
    app.set_note_tags(&note.id, &["home/projects/rust".into()])
        .unwrap();
    app.add_note_tag(&note.id, "home/plans").unwrap();
    let tags = app.get_tags_by_note_id(&note.id).unwrap();
    assert_eq!(tags.len(), 2);
    let rust = tags.iter().find(|tag| tag.name.ends_with("/rust")).unwrap();

    // An invalid replacement leaves the previous bindings intact.
    assert!(app
        .set_note_tags(&note.id, &["new".into(), "bad//name".into()])
        .is_err());
    assert_eq!(app.get_tags_by_note_id(&note.id).unwrap(), tags);
    app.remove_note_tag(&note.id, &rust.id).unwrap();
    let names: Vec<_> = app
        .list_tags()
        .unwrap()
        .into_iter()
        .map(|tag| tag.name)
        .collect();
    assert_eq!(names, ["home", "home/plans"]);

    // Trash retains bindings so restoring the note restores its tags.
    app.trash_note(&note.id).unwrap();
    app.cleanup_unused_tags().unwrap();
    assert_eq!(app.get_tags_by_note_id(&note.id).unwrap().len(), 1);
    app.delete_note_permanently(&note.id).unwrap();
    assert!(app.list_tags().unwrap().is_empty());
}

#[test]
fn pin_and_sibling_order_persist_and_cross_group_reorder_is_rejected() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let note = app.create_note().unwrap().summary;
    app.set_note_tags(
        &note.id,
        &["work/a".into(), "work/b".into(), "work/c".into()],
    )
    .unwrap();
    let tags = app.list_tags().unwrap();
    let id = |name| tags.iter().find(|tag| tag.name == name).unwrap().id.clone();
    let order = [id("work/c"), id("work/b"), id("work/a")];
    app.reorder_tags(&order).unwrap();
    assert!(app.toggle_tag_pin(&order[2]).unwrap());
    assert!(app.reorder_tags(&[id("work/c"), id("work")]).is_err());
    drop(app);

    let reopened = AppService::open(directory.path()).unwrap();
    let bound = reopened.get_tags_by_note_id(&note.id).unwrap();
    let names: Vec<_> = bound.iter().map(|tag| tag.name.as_str()).collect();
    assert_eq!(names, ["work/a", "work/c", "work/b"]);
    assert!(!reopened.toggle_tag_pin(&order[2]).unwrap());
    let bound = reopened.get_tags_by_note_id(&note.id).unwrap();
    let names: Vec<_> = bound.iter().map(|tag| tag.name.as_str()).collect();
    assert_eq!(names, ["work/c", "work/b", "work/a"]);
}

#[test]
fn renaming_preserves_nested_bindings_and_deleting_one_tag_preserves_descendants() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let note = app.create_note().unwrap().summary;
    app.set_note_tags(
        &note.id,
        &[
            "work".into(),
            "work/rust/deep".into(),
            "work/rusty".into(),
            "taken".into(),
        ],
    )
    .unwrap();
    let tags = app.list_tags().unwrap();
    let work = tags.iter().find(|tag| tag.name == "work").unwrap();
    let rust = tags.iter().find(|tag| tag.name == "work/rust").unwrap();
    assert!(app.rename_tag(&work.id, "taken").is_err());
    assert_eq!(app.list_tags().unwrap(), tags);

    assert_eq!(
        app.rename_tag(&rust.id, "work/code").unwrap().as_deref(),
        Some("work/rust")
    );
    app.rename_tag(&work.id, "studio").unwrap();
    let tags = app.get_tags_by_note_id(&note.id).unwrap();
    let deep = tags
        .iter()
        .find(|tag| tag.name == "studio/code/deep")
        .unwrap();
    assert_eq!(deep.parent_id.as_deref(), Some(rust.id.as_str()));
    assert!(tags.iter().any(|tag| tag.name == "studio/rusty"));

    assert_eq!(app.delete_tag(&work.id).unwrap(), vec![note.id.clone()]);
    let tags = app.list_tags().unwrap();
    assert!(tags.iter().all(|tag| tag.id != work.id));
    assert!(tags
        .iter()
        .any(|tag| tag.id == rust.id && tag.parent_id.is_none()));
    assert_eq!(app.get_notes_by_tag(&deep.id).unwrap(), vec![note]);

    let note_id = &app.get_notes_by_tag(&deep.id).unwrap()[0].id;
    app.add_note_tag(note_id, "studio").unwrap();
    let tags = app.list_tags().unwrap();
    let studio = tags.iter().find(|tag| tag.name == "studio").unwrap();
    assert!(tags
        .iter()
        .any(|tag| tag.id == rust.id && tag.parent_id.as_deref() == Some(studio.id.as_str())));
}
