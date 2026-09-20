-- Migration: 0029_update_plan_prices.sql
-- Description: Update subscription plan prices (monthly / quarterly / annual).
--   starter    -> monthly 201,  quarterly 573,   annual 1932
--   pro        -> monthly 501,  quarterly 1428,  annual 4812
--   enterprise -> monthly 1001, quarterly 2853,  annual 9612
-- Quarterly = round(monthly * 0.95) * 3  (5% off)
-- Annual    = round(monthly * 0.80) * 12 (20% off)

UPDATE subscription_plans
    SET monthly_price    = 201,
        quarterly_price  = 573,
        annual_price     = 1932,
        updated_at       = datetime('now')
    WHERE id = 'starter';

UPDATE subscription_plans
    SET monthly_price    = 501,
        quarterly_price  = 1428,
        annual_price     = 4812,
        updated_at       = datetime('now')
    WHERE id = 'pro';

UPDATE subscription_plans
    SET monthly_price    = 1001,
        quarterly_price  = 2853,
        annual_price     = 9612,
        updated_at       = datetime('now')
    WHERE id = 'enterprise';
