-- Minimal additive migration: add Google Wallet feature switch
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS google_wallet_enabled BOOLEAN NOT NULL DEFAULT false;
