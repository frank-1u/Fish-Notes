use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
};

use percent_encoding::percent_decode_str;
use uuid::Uuid;

use crate::{AppError, AppService};

const IMAGE_FORMATS: [(&str, &str); 7] = [
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("bmp", "image/bmp"),
    ("svg", "image/svg+xml"),
];

impl AppService {
    pub fn save_image(&self, bytes: &[u8], mime_type: &str) -> Result<String, AppError> {
        let (extension, _) = IMAGE_FORMATS
            .iter()
            .find(|(_, supported)| supported.eq_ignore_ascii_case(mime_type))
            .ok_or(AppError::UnsupportedImageType)?;
        let directory = self.image_directory(true)?;
        let filename = format!("{}.{extension}", Uuid::new_v4());
        let path = directory.join(&filename);
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(AppError::ImageStorage)?;
        if let Err(error) = file.write_all(bytes) {
            drop(file);
            let _ = fs::remove_file(&path);
            return Err(AppError::ImageStorage(error));
        }
        Ok(format!("fish-image://{filename}"))
    }

    pub fn read_image(&self, uri_path: &str) -> Result<(&'static str, Vec<u8>), AppError> {
        let encoded = uri_path
            .strip_prefix('/')
            .ok_or(AppError::InvalidImagePath)?;
        let filename = percent_decode_str(encoded)
            .decode_utf8()
            .map_err(|_| AppError::InvalidImagePath)?;
        let relative_path = Path::new(filename.as_ref());
        let mut components = relative_path.components();
        // Reject both platform separators and Windows drive or stream syntax on every OS.
        if filename.contains(['/', '\\', ':', '\0'])
            || !matches!(
                (components.next(), components.next()),
                (Some(Component::Normal(_)), None)
            )
        {
            return Err(AppError::InvalidImagePath);
        }

        let extension = relative_path
            .extension()
            .and_then(|extension| extension.to_str())
            .ok_or(AppError::InvalidImagePath)?;
        let (_, mime_type) = IMAGE_FORMATS
            .iter()
            .find(|(supported, _)| supported.eq_ignore_ascii_case(extension))
            .ok_or(AppError::InvalidImagePath)?;
        let directory = self.image_directory(false)?;
        let path = directory
            .join(relative_path)
            .canonicalize()
            .map_err(AppError::ImageStorage)?;
        if !path.starts_with(&directory) || !path.is_file() {
            return Err(AppError::InvalidImagePath);
        }
        Ok((mime_type, fs::read(path).map_err(AppError::ImageStorage)?))
    }

    fn image_directory(&self, create: bool) -> Result<PathBuf, AppError> {
        let directory = self
            .data_dir
            .canonicalize()
            .map_err(AppError::ImageStorage)?
            .join("images");
        if create {
            fs::create_dir_all(&directory).map_err(AppError::ImageStorage)?;
        }
        let canonical = directory.canonicalize().map_err(AppError::ImageStorage)?;
        if canonical != directory || !canonical.is_dir() {
            return Err(AppError::InvalidImagePath);
        }
        Ok(canonical)
    }
}
