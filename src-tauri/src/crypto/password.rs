use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use scrypt::{scrypt, Params};
use subtle::ConstantTimeEq;
use zeroize::Zeroizing;

use crate::{AppError, AppService};

const HASH_SETTING: &str = "encryption_password_hash";
const SALT_SETTING: &str = "encryption_password_salt";

pub(crate) struct SessionKey {
    bytes: Box<Zeroizing<[u8; 32]>>,
    salt: [u8; 16],
}

impl SessionKey {
    pub(super) fn as_slice(&self) -> &[u8] {
        self.bytes.as_slice()
    }

    fn is_current(&self, conn: &Connection) -> Result<bool, AppError> {
        Ok(conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM app_settings WHERE key = ?1 AND value = ?2)",
            params![SALT_SETTING, STANDARD.encode(self.salt)],
            |row| row.get(0),
        )?)
    }

    pub(crate) fn require<'a>(
        session: &'a Option<Self>,
        conn: &Connection,
    ) -> Result<&'a Self, AppError> {
        let key = session.as_ref().ok_or(AppError::SessionLocked)?;
        // The password may have changed in another instance using the same database.
        if !key.is_current(conn)? {
            return Err(AppError::SessionLocked);
        }
        Ok(key)
    }
}

struct Credentials {
    salt: [u8; 16],
    hash: [u8; 32],
}

impl Credentials {
    fn derive(password: &str, salt: &[u8; 16]) -> Result<([u8; 32], SessionKey), AppError> {
        // The persisted verifier and the encryption key use separate halves of the scrypt output.
        let mut output = Zeroizing::new([0u8; 64]);
        // These parameters are part of the persisted credential format.
        let params = Params::new(17, 8, 1, 32).map_err(|_| AppError::Encryption)?;
        scrypt(password.as_bytes(), salt, &params, output.as_mut())
            .map_err(|_| AppError::Encryption)?;
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&output[..32]);
        let mut key = SessionKey {
            bytes: Box::default(),
            salt: *salt,
        };
        key.bytes.copy_from_slice(&output[32..]);
        Ok((hash, key))
    }

    fn new(password: &str) -> Result<(Self, SessionKey), AppError> {
        if password.is_empty() {
            return Err(AppError::EmptyPassword);
        }
        let mut salt = [0u8; 16];
        getrandom::fill(&mut salt).map_err(|_| AppError::Encryption)?;
        let (hash, key) = Self::derive(password, &salt)?;
        Ok((Self { salt, hash }, key))
    }

    fn load(conn: &Connection) -> Result<Option<Self>, AppError> {
        let stored = conn
            .query_row(
                "SELECT value, (SELECT value FROM app_settings WHERE key = ?2)
                 FROM app_settings WHERE key = ?1",
                params![HASH_SETTING, SALT_SETTING],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        let Some((hash_encoded, salt_encoded)) = stored else {
            return Ok(None);
        };
        let mut credentials = Self {
            hash: [0; 32],
            salt: [0; 16],
        };
        for (encoded, buffer) in [
            (hash_encoded, credentials.hash.as_mut_slice()),
            (salt_encoded, credentials.salt.as_mut_slice()),
        ] {
            let decoded = STANDARD.decode(encoded).map_err(|_| AppError::Encryption)?;
            if decoded.len() != buffer.len() {
                return Err(AppError::Encryption);
            }
            buffer.copy_from_slice(&decoded);
        }
        Ok(Some(credentials))
    }

    fn save(&self, conn: &Connection) -> Result<(), AppError> {
        conn.execute(
            "INSERT INTO app_settings(key, value) VALUES (?1, ?2), (?3, ?4)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![
                HASH_SETTING,
                STANDARD.encode(self.hash),
                SALT_SETTING,
                STANDARD.encode(self.salt)
            ],
        )?;
        Ok(())
    }

    fn verify(&self, password: &str) -> Result<Option<SessionKey>, AppError> {
        let (hash, key) = Self::derive(password, &self.salt)?;
        Ok(bool::from(hash.ct_eq(&self.hash)).then_some(key))
    }

    fn verified_key(conn: &Connection, password: &str) -> Result<Option<SessionKey>, AppError> {
        match Self::load(conn)? {
            Some(credentials) => credentials.verify(password),
            None => Ok(None),
        }
    }
}

impl AppService {
    pub fn lock_all(&self) -> Result<(), AppError> {
        let mut session = self.session_key.write().map_err(|_| AppError::Encryption)?;
        *session = None;
        Ok(())
    }

    pub fn has_password(&self) -> Result<bool, AppError> {
        let conn = self.database.get()?;
        Ok(conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM app_settings WHERE key = ?1)",
            [HASH_SETTING],
            |row| row.get(0),
        )?)
    }

    pub fn is_unlocked(&self) -> Result<bool, AppError> {
        let session = self.session_key.read().map_err(|_| AppError::Encryption)?;
        let Some(key) = session.as_ref() else {
            return Ok(false);
        };
        let conn = self.database.get()?;
        key.is_current(&conn)
    }

    pub fn set_password(&self, password: &str) -> Result<(), AppError> {
        let mut session = self.session_key.write().map_err(|_| AppError::Encryption)?;
        let mut conn = self.database.get()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        if Credentials::load(&tx)?.is_some() {
            return Err(AppError::PasswordAlreadySet);
        }
        let (credentials, key) = Credentials::new(password)?;
        credentials.save(&tx)?;
        tx.commit()?;
        *session = Some(key);
        Ok(())
    }

    pub fn verify_password(&self, password: &str) -> Result<bool, AppError> {
        let mut session = self.session_key.write().map_err(|_| AppError::Encryption)?;
        let conn = self.database.get()?;
        let Some(key) = Credentials::verified_key(&conn, password)? else {
            return Ok(false);
        };
        *session = Some(key);
        Ok(true)
    }

    pub fn change_password(&self, old: &str, new: &str) -> Result<bool, AppError> {
        let mut session = self.session_key.write().map_err(|_| AppError::Encryption)?;
        let mut conn = self.database.get()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let Some(old_key) = Credentials::verified_key(&tx, old)? else {
            return Ok(false);
        };
        let (credentials, new_key) = Credentials::new(new)?;
        super::note::rewrite_encrypted_notes(&tx, &old_key, Some(&new_key))?;
        credentials.save(&tx)?;
        tx.commit()?;
        *session = Some(new_key);
        Ok(true)
    }

    pub fn remove_password(&self, password: &str) -> Result<bool, AppError> {
        let mut session = self.session_key.write().map_err(|_| AppError::Encryption)?;
        let mut conn = self.database.get()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let Some(key) = Credentials::verified_key(&tx, password)? else {
            return Ok(false);
        };
        super::note::rewrite_encrypted_notes(&tx, &key, None)?;
        tx.execute(
            "DELETE FROM app_settings WHERE key IN (?1, ?2)",
            params![HASH_SETTING, SALT_SETTING],
        )?;
        tx.commit()?;
        *session = None;
        Ok(true)
    }
}
