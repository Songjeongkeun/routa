-- ROUTA 인증·사용자 스키마
-- PostgreSQL에서 이 파일을 최초 1회 실행한다.

CREATE TABLE IF NOT EXISTS users (
  user_id BIGSERIAL PRIMARY KEY,
  login_id VARCHAR(30),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  nickname VARCHAR(50) NOT NULL,
  signup_type VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
  role VARCHAR(20) NOT NULL DEFAULT 'USER',
  account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  email_verified_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT users_signup_type_check CHECK (signup_type IN ('LOCAL', 'OAUTH')),
  CONSTRAINT users_role_check CHECK (role IN ('USER', 'ADMIN')),
  CONSTRAINT users_status_check CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'WITHDRAWN')),
  CONSTRAINT users_local_credentials_check CHECK (
    signup_type <> 'LOCAL' OR (login_id IS NOT NULL AND password_hash IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS users_login_id_lower_unique
  ON users (LOWER(login_id))
  WHERE login_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS oauth_accounts (
  oauth_account_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  provider_email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT oauth_provider_check CHECK (provider IN ('GOOGLE', 'KAKAO')),
  CONSTRAINT oauth_provider_user_unique UNIQUE (provider, provider_user_id),
  CONSTRAINT oauth_user_provider_unique UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  refresh_token_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_index
  ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_index
  ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  reset_token_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_index
  ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_index
  ON password_reset_tokens(expires_at);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  verification_token_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_id_index
  ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_at_index
  ON email_verification_tokens(expires_at);
