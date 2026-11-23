use std::fs;

use fish_notes::AppService;
use tempfile::tempdir;

#[test]
fn imports_markdown_and_text_as_notes_with_filename_titles() {
    let directory = tempdir().unwrap();
    let app = AppService::open(&directory.path().join("data")).unwrap();
    let markdown = directory.path().join("Trip.plan.MARKDOWN");
    let text = directory.path().join("备忘.txt");
    fs::write(&markdown, "# Packing\n\n- Shoes").unwrap();
    fs::write(&text, "带上雨伞\n带上水").unwrap();

    let result = app.import_files([markdown, text]);
    assert!(result.failed.is_empty());
    assert_eq!(result.created.len(), 2);
    assert_eq!(result.created[0].title, "Trip.plan");
    assert_eq!(result.created[0].preview, "Packing Shoes");
    assert_eq!(result.created[1].title, "备忘");

    drop(app);
    let app = AppService::open(&directory.path().join("data")).unwrap();
    let first = app.get_note(&result.created[0].id).unwrap().unwrap();
    assert_eq!(first.content, "# Packing\n\n- Shoes");
    assert_eq!(first.content_text, "Packing Shoes");
    let second = app.get_note(&result.created[1].id).unwrap().unwrap();
    assert_eq!(second.content, "带上雨伞\n带上水");
    assert_eq!(second.content_text, "带上雨伞 带上水");
}

#[test]
fn imports_html_as_markdown_with_heading_list_code_and_link() {
    let directory = tempdir().unwrap();
    let app = AppService::open(&directory.path().join("data")).unwrap();
    let html = directory.path().join("Web clipping.HTM");
    fs::write(
        &html,
        r#"<!doctype html><html><head><title>Page metadata</title>
          <style>body { color: red }</style></head><body>
          <h1>Field notes</h1><ul><li>First item</li><li>Second item</li></ul>
          <pre><code class="language-js">const location = "lake";</code></pre>
          <p><a href="https://example.com/">Reference</a></p>
          <script>window.alert('irrelevant');</script>
          </body></html>"#,
    )
    .unwrap();

    let result = app.import_files([html]);
    assert!(result.failed.is_empty());
    assert_eq!(result.created.len(), 1);
    assert_eq!(result.created[0].title, "Web clipping");
    assert_eq!(
        result.created[0].preview,
        "Field notes First item Second item Reference"
    );
    let note = app.get_note(&result.created[0].id).unwrap().unwrap();
    assert_eq!(
        note.content,
        "# Field notes\n\n*   First item\n*   Second item\n\n```js\nconst location = \"lake\";\n```\n\n[Reference](https://example.com/)"
    );
}

#[test]
fn reports_failed_selections_and_continues_importing_other_files() {
    let directory = tempdir().unwrap();
    let app = AppService::open(&directory.path().join("data")).unwrap();
    let unreadable = directory.path().join("invalid.txt");
    let unsupported = directory.path().join("wrong.csv");
    let markdown = directory.path().join("reference.md");
    let html = directory.path().join("clipping.html");
    fs::write(&unreadable, [0xff]).unwrap();
    fs::write(&unsupported, "like,a,spreadsheet").unwrap();
    fs::write(&markdown, "Reference text").unwrap();
    fs::write(&html, "<p>Clipped text</p>").unwrap();

    let result = app.import_files([
        unreadable,
        markdown,
        unsupported,
        directory.path().join("missing.html"),
        html,
    ]);
    let successful: Vec<_> = result
        .created
        .iter()
        .map(|note| note.title.as_str())
        .collect();
    assert_eq!(successful, ["reference", "clipping"]);
    let failures: Vec<_> = result
        .failed
        .iter()
        .map(|failure| failure.name.as_str())
        .collect();
    assert_eq!(failures, ["invalid.txt", "wrong.csv", "missing.html"]);
    assert!(result
        .failed
        .iter()
        .all(|failure| !failure.error.is_empty()));
    assert_eq!(app.list_notes(false).unwrap().len(), 2);
}

#[test]
fn saves_markdown_and_html_to_selected_files_and_reports_cancellation() {
    let directory = tempdir().unwrap();
    let markdown = "# Title\n\n你好";
    let html = "<!doctype html><title>Title</title><p>你好</p>";
    let markdown_path = directory.path().join("note.md");
    let html_path = directory.path().join("note.html");

    assert!(!AppService::save_export(None, markdown).unwrap());
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 0);
    fs::write(
        &markdown_path,
        "Old Markdown contents that should be replaced",
    )
    .unwrap();
    assert!(AppService::save_export(Some(&markdown_path), markdown).unwrap());
    assert!(AppService::save_export(Some(&html_path), html).unwrap());
    assert_eq!(fs::read_to_string(markdown_path).unwrap(), markdown);
    assert_eq!(fs::read_to_string(html_path).unwrap(), html);
    assert!(AppService::save_export(Some(directory.path()), html).is_err());
}
