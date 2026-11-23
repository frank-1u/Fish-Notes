use aes_gcm::{
    aead::{Aead, Payload},
    Aes256Gcm, KeyInit, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Transaction};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use super::SessionKey;
use crate::AppError;

const NONCE_BYTES: usize = 12;

#[derive(Serialize, Deserialize)]
pub(crate) struct NoteBody {
    pub(crate) content: String,
    pub(crate) content_text: String,
}

impl NoteBody {
    pub(crate) fn encrypt(&self, key: &SessionKey, id: &str) -> Result<String, AppError> {
        let mut nonce = [0u8; NONCE_BYTES];
        getrandom::fill(&mut nonce).map_err(|_| AppError::Encryption)?;
        let plaintext = Zeroizing::new(serde_json::to_vec(self).map_err(|_| AppError::Encryption)?);
        let cipher = Aes256Gcm::new_from_slice(key.as_slice()).map_err(|_| AppError::Encryption)?;
        let ciphertext = cipher
            .encrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &plaintext,
                    aad: id.as_bytes(),
                },
            )
            .map_err(|_| AppError::Encryption)?;
        let mut encoded = nonce.to_vec();
        encoded.extend(ciphertext);
        Ok(STANDARD.encode(encoded))
    }

    pub(crate) fn decrypt(key: &SessionKey, id: &str, content: &str) -> Result<Self, AppError> {
        let encoded = STANDARD.decode(content).map_err(|_| AppError::Encryption)?;
        if encoded.len() < NONCE_BYTES {
            return Err(AppError::Encryption);
        }
        let (nonce, ciphertext) = encoded.split_at(NONCE_BYTES);
        let cipher = Aes256Gcm::new_from_slice(key.as_slice()).map_err(|_| AppError::Encryption)?;
        let plaintext = Zeroizing::new(
            cipher
                .decrypt(
                    Nonce::from_slice(nonce),
                    Payload {
                        msg: ciphertext,
                        aad: id.as_bytes(),
                    },
                )
                .map_err(|_| AppError::Encryption)?,
        );
        serde_json::from_slice(&plaintext).map_err(|_| AppError::Encryption)
    }
}

pub(super) fn rewrite_encrypted_notes(
    tx: &Transaction<'_>,
    old: &SessionKey,
    new: Option<&SessionKey>,
) -> Result<(), AppError> {
    let mut statement = tx.prepare("SELECT id, content FROM notes WHERE is_locked")?;
    let encrypted_notes = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for (id, ciphertext) in encrypted_notes {
        let body = NoteBody::decrypt(old, &id, &ciphertext)?;
        if let Some(key) = new {
            tx.execute(
                "UPDATE notes SET content = ?1 WHERE id = ?2",
                params![body.encrypt(key, &id)?, id],
            )?;
        } else {
            tx.execute(
                "UPDATE notes SET content = ?1, content_text = ?2, is_locked = 0 WHERE id = ?3",
                params![body.content, body.content_text, id],
            )?;
        }
    }
    Ok(())
}
