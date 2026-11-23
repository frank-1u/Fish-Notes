use std::fs;

use fish_notes::{AppError, AppService};
use tempfile::tempdir;
use uuid::Uuid;

#[test]
fn saved_images_can_be_read_with_their_original_bytes_and_content_type() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    // The store transports the bytes supplied by the caller without decoding them.
    let formats: [(&str, &str, &[u8]); 6] = [
        ("image/png", ".png", b"\x89PNG\r\n\x1a\n"),
        ("image/jpeg", ".jpg", b"\xff\xd8\xff"),
        ("image/gif", ".gif", b"GIF89a"),
        ("image/webp", ".webp", b"RIFF\x00\x00\x00\x00WEBP"),
        ("image/bmp", ".bmp", b"BM"),
        (
            "image/svg+xml",
            ".svg",
            b"<svg xmlns='http://www.w3.org/2000/svg'/>",
        ),
    ];

    for (mime_type, extension, bytes) in formats {
        let reference = app.save_image(bytes, mime_type).unwrap();
        let filename = reference.strip_prefix("fish-image://").unwrap();
        let id = filename.strip_suffix(extension).unwrap();
        assert_eq!(Uuid::parse_str(id).unwrap().get_version_num(), 4);
        assert_eq!(
            app.read_image(&format!("/{filename}")).unwrap(),
            (mime_type, bytes.to_vec())
        );
        assert_eq!(
            app.read_image(&format!("/{id}%2E{}", &extension[1..]))
                .unwrap(),
            (mime_type, bytes.to_vec())
        );
    }
}

#[test]
fn unsupported_mime_types_are_rejected_without_creating_an_image() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let result = app.save_image(b"plain text", "text/plain");
    assert!(matches!(result, Err(AppError::UnsupportedImageType)));
    assert!(!directory.path().join("images").exists());
}

#[test]
fn protocol_rejects_paths_other_than_a_single_filename() {
    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let images = directory.path().join("images");
    fs::create_dir_all(images.join("nested")).unwrap();
    fs::write(directory.path().join("outside.png"), b"outside").unwrap();
    fs::write(images.join("nested/inside.png"), b"nested").unwrap();
    fs::write(images.join("inside.png"), b"inside").unwrap();

    for path in [
        "/",
        "/.",
        "/..",
        "/%2e%2e",
        "/../outside.png",
        "/%2e%2e%2foutside.png",
        "/%2e%2e%5coutside.png",
        "/nested/inside.png",
        "/nested%2Finside.png",
        "/./inside.png",
        "/inside.png/",
        "//inside.png",
        "/%2Finside.png",
        "/C:%5Cinside.png",
        "/inside.png%3Astream.png",
        "/%FF.png",
    ] {
        assert!(
            matches!(app.read_image(path), Err(AppError::InvalidImagePath)),
            "{path}"
        );
    }
}

#[cfg(unix)]
#[test]
fn protocol_rejects_symlinks_to_files_outside_the_images_directory() {
    use std::os::unix::fs::symlink;

    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let sibling = directory.path().join("images-backup");
    fs::create_dir(&sibling).unwrap();
    let outside_image = sibling.join("outside.png");
    fs::write(&outside_image, b"outside").unwrap();

    let images = directory.path().join("images");
    fs::create_dir(&images).unwrap();
    symlink(outside_image, images.join("alias.png")).unwrap();
    assert!(matches!(
        app.read_image("/alias.png"),
        Err(AppError::InvalidImagePath)
    ));
}

#[cfg(unix)]
#[test]
fn image_storage_rejects_an_images_directory_that_is_a_symlink() {
    use std::os::unix::fs::symlink;

    let directory = tempdir().unwrap();
    let app = AppService::open(directory.path()).unwrap();
    let outside = tempdir().unwrap();
    fs::write(outside.path().join("outside.png"), b"outside").unwrap();
    symlink(outside.path(), directory.path().join("images")).unwrap();

    assert!(matches!(
        app.read_image("/outside.png"),
        Err(AppError::InvalidImagePath)
    ));
    assert!(matches!(
        app.save_image(b"PNG", "image/png"),
        Err(AppError::InvalidImagePath)
    ));
}
