-- v17.0 Priority 3: Grocery Price History & Prediction
-- Track historical prices for trend analysis and smart buying recommendations

CREATE TABLE IF NOT EXISTS price_history (
  id BIGSERIAL PRIMARY KEY,
  
  -- Item info
  item_name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  
  -- Price data
  price_per_100g DECIMAL(10, 2) NOT NULL,
  store VARCHAR(100) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  
  -- Metadata
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Tracking
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraint for uniqueness per day
  CONSTRAINT unique_daily_price UNIQUE (item_name, store, recorded_date)
);

-- Create indexes for performance
CREATE INDEX idx_price_history_item_store_date ON price_history (item_name, store, recorded_date);
CREATE INDEX idx_price_history_user_date ON price_history (user_id, recorded_date);

-- Table for storing computed price trends
CREATE TABLE IF NOT EXISTS price_trends (
  id BIGSERIAL PRIMARY KEY,
  
  -- Item info
  item_name VARCHAR(255) NOT NULL UNIQUE,
  store VARCHAR(100),
  category VARCHAR(100),
  
  -- Trend data
  avg_price_7d DECIMAL(10, 2),
  avg_price_30d DECIMAL(10, 2),
  current_price DECIMAL(10, 2),
  min_price_30d DECIMAL(10, 2),
  max_price_30d DECIMAL(10, 2),
  price_std_dev DECIMAL(10, 2),
  
  -- Prediction
  predicted_price_next_week DECIMAL(10, 2),
  trend_direction VARCHAR(20), -- 'up', 'down', 'stable'
  seasonality_factor DECIMAL(5, 2), -- seasonal multiplier
  recommended_buy_window VARCHAR(100), -- 'now', 'wait_1_week', 'seasonal_high', etc
  
  -- Metadata
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data_points INT DEFAULT 0
);

-- Create indexes
CREATE INDEX idx_price_trends_item_store ON price_trends (item_name, store);

-- Enable RLS (Row Level Security)
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_trends ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only see their own price history
CREATE POLICY "Users can read own price history" ON price_history
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert own price history" ON price_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Price trends are public (can be shared across users for aggregate insights)
CREATE POLICY "Anyone can read price trends" ON price_trends
  FOR SELECT USING (true);
