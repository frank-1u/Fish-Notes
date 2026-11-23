import { api, parseAppError, type AIConfig, type AiProtocol } from '../api';
import { useState, useCallback, useEffect, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { useAppActions, useEncryption } from '../contexts/AppContext';
import { message } from './message';
import { modal } from './modal';
import { isAssistantEnabled, setAssistantEnabled } from './assistant/Assistant';

interface SettingsProps {
  onClose: () => void;
}

const languages = [
  { id: 'zh-CN', label: '中文' },
  { id: 'en', label: 'English' },
];

const AI_INPUT_CLASS = 'w-full px-3 py-2 rounded-lg border text-sm outline-none';
const AI_INPUT_STYLE = {
  backgroundColor: 'var(--bg-secondary)',
  borderColor: 'var(--border-primary)',
  color: 'var(--text-primary)',
};

function Settings({ onClose }: SettingsProps) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { encryptionReady, sessionUnlocked } = useEncryption();
  const { refreshEncryptionState, refreshNotes, lockAllNotes } = useAppActions();

  const [passwordView, setPasswordView] = useState<'none' | 'set' | 'change' | 'remove'>('none');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [assistantOn, setAssistantOn] = useState(isAssistantEnabled);

  const [aiConfig, setAiConfig] = useState<AIConfig>({
    protocol: 'openai',
    baseUrl: '',
    model: '',
    apiKey: '',
  });
  const [aiHasKey, setAiHasKey] = useState(false);
  const [aiStatus, setAiStatus] = useState<'loading' | 'saving' | 'testing' | 'idle'>('loading');

  useEffect(() => {
    let active = true;
    api.ai
      .getConfig()
      .then((config) => {
        if (!active || !config) return;
        const { hasApiKey, ...fields } = config;
        setAiHasKey(hasApiKey);
        setAiConfig({ ...fields, apiKey: '' });
      })
      .catch((error) => {
        if (active) message.error(parseAppError(error).message);
      })
      .finally(() => {
        if (active) setAiStatus('idle');
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSaveAI = useCallback(async () => {
    setAiStatus('saving');
    try {
      await api.ai.setConfig(aiConfig);
      setAiHasKey(true);
      setAiConfig((fields) => ({ ...fields, apiKey: '' }));
      message.success(t('Saved'));
    } catch (error) {
      message.error(parseAppError(error).message);
    } finally {
      setAiStatus('idle');
    }
  }, [aiConfig, t]);

  const handleTestAI = useCallback(async () => {
    setAiStatus('testing');
    try {
      const reply = await api.ai.testConnection(aiConfig);
      message.success(`${t('Connection successful')} · ${reply}`);
    } catch (error) {
      modal.error({
        title: t('Connection failed'),
        content: (
          <pre className="whitespace-pre-wrap break-all">{parseAppError(error).message}</pre>
        ),
      });
    } finally {
      setAiStatus('idle');
    }
  }, [aiConfig, t]);

  const themes = [
    { id: 'light' as const, label: t('Light'), preview: 'bg-white border-gray-200' },
    { id: 'dark' as const, label: t('Dark'), preview: 'bg-gray-900 border-gray-700' },
    { id: 'solarized' as const, label: t('Solarized'), preview: 'bg-[#fdf6e3] border-[#e0d9c4]' },
    {
      id: 'anime' as const,
      label: t('Anime (Day)'),
      preview: 'border-transparent',
      previewStyle: {
        background: 'linear-gradient(135deg, #FFD9A8 0%, #FFB0A0 45%, #8E7BD8 100%)',
      },
    },
    {
      id: 'anime-night' as const,
      label: t('Anime (Night)'),
      preview: 'border-transparent',
      previewStyle: {
        background: 'linear-gradient(135deg, #6E8DFF 0%, #4A3E8E 55%, #14142B 100%)',
      },
    },
    {
      id: 'cinnamoroll' as const,
      label: t('Cinnamoroll (Day)'),
      preview: 'border-transparent',
      previewStyle: {
        background: 'linear-gradient(135deg, #E3F2FD 0%, #A8CDF8 55%, #C9C2F8 100%)',
      },
    },
    {
      id: 'cinnamoroll-night' as const,
      label: t('Cinnamoroll (Night)'),
      preview: 'border-transparent',
      previewStyle: {
        background: 'linear-gradient(135deg, #7EA6FF 0%, #3A3F73 55%, #1C2340 100%)',
      },
    },
    {
      id: 'kuromi' as const,
      label: t('Kuromi (Day)'),
      preview: 'border-transparent',
      previewStyle: {
        background: 'linear-gradient(135deg, #F3EDFA 0%, #C9A8F0 55%, #E85CA8 100%)',
      },
    },
    {
      id: 'kuromi-night' as const,
      label: t('Kuromi (Night)'),
      preview: 'border-transparent',
      previewStyle: {
        background: 'linear-gradient(135deg, #A06CE8 0%, #4A2E7A 55%, #171223 100%)',
      },
    },
    {
      id: 'melody' as const,
      label: t('My Melody (Day)'),
      preview: 'border-transparent',
      previewStyle: {
        background: 'linear-gradient(135deg, #FFE9F1 0%, #F9A8C6 55%, #EC5F94 100%)',
      },
    },
    {
      id: 'melody-night' as const,
      label: t('My Melody (Night)'),
      preview: 'border-transparent',
      previewStyle: {
        background: 'linear-gradient(135deg, #F48EB4 0%, #7A3C5E 55%, #241521 100%)',
      },
    },
    {
      id: 'totoro' as const,
      label: t('Totoro (Day)'),
      preview: 'border-transparent',
      previewStyle: {
        background: 'linear-gradient(135deg, #F2F5E3 0%, #A8CC8A 55%, #4E8A57 100%)',
      },
    },
    {
      id: 'totoro-night' as const,
      label: t('Totoro (Night)'),
      preview: 'border-transparent',
      previewStyle: {
        background: 'linear-gradient(135deg, #98C455 0%, #2F4A2A 55%, #16211A 100%)',
      },
    },
    {
      id: 'ink' as const,
      label: t('Ink (Day)'),
      preview: 'border-transparent',
      previewStyle: {
        background: 'linear-gradient(135deg, #F9F6EF 0%, #D8D0BC 55%, #4A443C 100%)',
      },
    },
    {
      id: 'ink-night' as const,
      label: t('Ink (Night)'),
      preview: 'border-transparent',
      previewStyle: {
        background: 'linear-gradient(135deg, #8A837A 0%, #3E3A34 55%, #1E1C19 100%)',
      },
    },
  ];

  const resetForm = useCallback(() => {
    setPasswordView('none');
    setPassword('');
    setConfirmPassword('');
    setOldPassword('');
  }, []);

  const handleSetPassword = useCallback(async () => {
    if (!password) {
      message.error(t('Please enter a password'));
      return;
    }
    if (password !== confirmPassword) {
      message.error(t('Passwords do not match'));
      return;
    }
    setLoading(true);
    try {
      await api.encryption.setPassword(password);
      await refreshEncryptionState();
      resetForm();
      message.success(t('Password set'));
    } catch (error) {
      message.error(parseAppError(error).message);
    } finally {
      setLoading(false);
    }
  }, [password, confirmPassword, refreshEncryptionState, resetForm, t]);

  const handleChangePassword = useCallback(async () => {
    if (!oldPassword) {
      message.error(t('Please enter current password'));
      return;
    }
    if (!password) {
      message.error(t('Please enter new password'));
      return;
    }
    if (password !== confirmPassword) {
      message.error(t('Passwords do not match'));
      return;
    }
    setLoading(true);
    try {
      if (!(await api.encryption.changePassword(oldPassword, password))) {
        message.error(t('Current password is incorrect'));
        return;
      }
      await refreshEncryptionState();
      resetForm();
      message.success(t('Password changed'));
    } catch (error) {
      message.error(parseAppError(error).message);
    } finally {
      setLoading(false);
    }
  }, [oldPassword, password, confirmPassword, refreshEncryptionState, resetForm, t]);

  const handleRemovePassword = useCallback(async () => {
    if (!password) {
      message.error(t('Please enter a password'));
      return;
    }
    setLoading(true);
    try {
      if (!(await api.encryption.removePassword(password))) {
        message.error(t('Incorrect password'));
        return;
      }
      await refreshEncryptionState();
      await refreshNotes();
      resetForm();
      message.success(t('Encryption removed'));
    } catch (error) {
      message.error(parseAppError(error).message);
    } finally {
      setLoading(false);
    }
  }, [password, refreshEncryptionState, refreshNotes, resetForm, t]);

  const handleLanguageChange = useCallback(
    (lng: string) => {
      i18n.changeLanguage(lng);
      localStorage.setItem('language', lng);
    },
    [i18n],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'var(--overlay-bg)' }}
    >
      <div
        className="w-[400px] max-h-[88vh] rounded-xl shadow-2xl flex flex-col"
        style={{ backgroundColor: 'var(--card-bg)' }}
      >
        {/* Header (sticky-feeling: stays visible while body scrolls) */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('Settings')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto">
          {/* Theme selection */}
          <div className="px-6 py-5">
            <div className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
              {t('Theme')}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {themes.map((th) => (
                <button
                  key={th.id}
                  onClick={() => setTheme(th.id)}
                  className="flex flex-col items-center gap-2 p-3 rounded-lg border-2 border-transparent transition-all hover:-translate-y-0.5"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    boxShadow:
                      theme === th.id ? '0 0 0 2px var(--accent-solid, #3b82f6)' : undefined,
                  }}
                >
                  <div
                    className={`w-full h-12 rounded-md border ${th.preview}`}
                    style={'previewStyle' in th ? th.previewStyle : undefined}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {th.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Language selection */}
          <div className="px-6 pb-5">
            <div className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
              {t('Language')}
            </div>
            <div className="flex gap-3">
              {languages.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => handleLanguageChange(lang.id)}
                  className="flex-1 px-3 py-2 rounded-lg border-2 border-transparent text-sm transition-all hover:-translate-y-0.5"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    boxShadow:
                      i18n.language === lang.id
                        ? '0 0 0 2px var(--accent-solid, #3b82f6)'
                        : undefined,
                  }}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* Encryption section */}
          <div className="px-6 pb-5">
            <div className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
              {t('Encryption')}
            </div>

            {passwordView === 'none' ? (
              <div className="flex flex-col gap-2">
                {!encryptionReady ? (
                  <button
                    onClick={() => setPasswordView('set')}
                    className="px-3 py-2 rounded-lg text-sm text-white transition-colors"
                    style={{ backgroundColor: '#3b82f6' }}
                  >
                    {t('Set Encryption Password')}
                  </button>
                ) : (
                  <>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                      {t('Encryption password is set.')}
                      {sessionUnlocked ? t('Session unlocked.') : t('Session locked.')}
                    </p>
                    {sessionUnlocked && (
                      <button
                        onClick={lockAllNotes}
                        className="px-3 py-2 rounded-lg text-sm transition-colors"
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {t('Lock Session')}
                      </button>
                    )}
                    <button
                      onClick={() => setPasswordView('change')}
                      className="px-3 py-2 rounded-lg text-sm transition-colors"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {t('Change Password')}
                    </button>
                    <button
                      onClick={() => setPasswordView('remove')}
                      className="px-3 py-2 rounded-lg text-sm transition-colors"
                      style={{ color: '#ef4444', backgroundColor: 'var(--bg-tertiary)' }}
                    >
                      {t('Remove Password')}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {passwordView === 'set' && (
                  <>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                      }}
                      placeholder={t('Set password')}
                      autoFocus
                      className="px-3 py-2 rounded-lg border text-sm outline-none"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-primary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                      }}
                      placeholder={t('Confirm password')}
                      className="px-3 py-2 rounded-lg border text-sm outline-none"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-primary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </>
                )}
                {passwordView === 'change' && (
                  <>
                    <input
                      type="password"
                      value={oldPassword}
                      onChange={(e) => {
                        setOldPassword(e.target.value);
                      }}
                      placeholder={t('Current password')}
                      autoFocus
                      className="px-3 py-2 rounded-lg border text-sm outline-none"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-primary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                      }}
                      placeholder={t('New password')}
                      className="px-3 py-2 rounded-lg border text-sm outline-none"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-primary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                      }}
                      placeholder={t('Confirm new password')}
                      className="px-3 py-2 rounded-lg border text-sm outline-none"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-primary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </>
                )}
                {passwordView === 'remove' && (
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                    }}
                    placeholder={t('Enter password to confirm removal')}
                    autoFocus
                    className="px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-primary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                )}

                <div className="flex gap-2 mt-1">
                  <button
                    onClick={resetForm}
                    className="flex-1 px-3 py-1.5 rounded-lg text-sm transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {t('Cancel')}
                  </button>
                  <button
                    onClick={
                      passwordView === 'set'
                        ? handleSetPassword
                        : passwordView === 'change'
                          ? handleChangePassword
                          : handleRemovePassword
                    }
                    disabled={loading}
                    className="flex-1 px-3 py-1.5 rounded-lg text-sm text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: passwordView === 'remove' ? '#ef4444' : '#3b82f6' }}
                  >
                    {loading
                      ? t('Processing...')
                      : passwordView === 'set'
                        ? t('Set')
                        : passwordView === 'change'
                          ? t('Change')
                          : t('Remove')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* AI assistant toggle */}
          <div className="px-6 pb-5">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {t('Show floating assistant')}
              </span>
              <input
                type="checkbox"
                checked={assistantOn}
                onChange={(e) => {
                  setAssistantOn(e.target.checked);
                  setAssistantEnabled(e.target.checked);
                }}
              />
            </label>
          </div>

          <div className="px-6 pb-5">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              {t('AI Provider')}
            </h3>
            {!aiHasKey && aiStatus !== 'loading' && (
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                {t('Enter your API provider settings to start using the assistant.')}
              </p>
            )}

            <fieldset
              disabled={aiStatus !== 'idle'}
              className="flex flex-col gap-3 text-sm disabled:opacity-60"
            >
              <label>
                <span className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {t('Protocol')}
                </span>
                <select
                  value={aiConfig.protocol}
                  onChange={(event) =>
                    setAiConfig({ ...aiConfig, protocol: event.target.value as AiProtocol })
                  }
                  className={AI_INPUT_CLASS}
                  style={AI_INPUT_STYLE}
                >
                  <option value="openai">OpenAI-compatible</option>
                  <option value="anthropic">Anthropic Messages</option>
                </select>
              </label>

              <label>
                <span className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {t('Base URL')}
                </span>
                <input
                  type="url"
                  value={aiConfig.baseUrl}
                  onChange={(event) => setAiConfig({ ...aiConfig, baseUrl: event.target.value })}
                  placeholder={
                    aiConfig.protocol === 'anthropic'
                      ? 'https://api.anthropic.com'
                      : 'https://api.openai.com/v1'
                  }
                  className={`${AI_INPUT_CLASS} font-mono`}
                  style={AI_INPUT_STYLE}
                />
              </label>

              <label>
                <span className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {t('API Key')}
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={aiConfig.apiKey}
                  onChange={(event) => setAiConfig({ ...aiConfig, apiKey: event.target.value })}
                  placeholder={aiHasKey ? t('Leave blank to keep your saved API key') : undefined}
                  className={`${AI_INPUT_CLASS} font-mono`}
                  style={AI_INPUT_STYLE}
                />
              </label>

              <label>
                <span className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {t('Model')}
                </span>
                <input
                  type="text"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={aiConfig.model}
                  onChange={(event) => setAiConfig({ ...aiConfig, model: event.target.value })}
                  className={AI_INPUT_CLASS}
                  style={AI_INPUT_STYLE}
                />
              </label>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveAI}
                  className="px-3 py-1.5 rounded-lg text-sm text-white transition-colors"
                  style={{ backgroundColor: '#f97316' }}
                >
                  {aiStatus === 'saving' ? t('Processing...') : t('Save')}
                </button>
                <button
                  type="button"
                  onClick={handleTestAI}
                  className="px-3 py-1.5 rounded-lg text-sm border transition-colors"
                  style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
                >
                  {aiStatus === 'testing' ? t('Testing...') : t('Test connection')}
                </button>
              </div>
            </fieldset>
          </div>

          {/* /Scrollable body */}
        </div>
      </div>
    </div>
  );
}

export default Settings;
