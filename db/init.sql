CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    role VARCHAR(20) CHECK (role IN ('passenger', 'driver', 'admin')),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE drivers (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    nrc VARCHAR(50) UNIQUE NOT NULL,
    nrc_image_url TEXT,
    license_number VARCHAR(50) UNIQUE NOT NULL,
    license_image_url TEXT,
    vehicle_model VARCHAR(100),
    vehicle_plate VARCHAR(20) UNIQUE,
    vehicle_color VARCHAR(30),
    selfie_url TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','active','suspended')),
    subscription_status VARCHAR(20) DEFAULT 'inactive' CHECK (subscription_status IN ('active','inactive','expired')),
    subscription_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE trips (
    id SERIAL PRIMARY KEY,
    passenger_id INTEGER REFERENCES users(id),
    driver_id INTEGER REFERENCES drivers(user_id),
    request_id VARCHAR(50) UNIQUE,
    pickup_lat DECIMAL(10,8),
    pickup_lng DECIMAL(11,8),
    pickup_address TEXT,
    dest_lat DECIMAL(10,8),
    dest_lng DECIMAL(11,8),
    dest_address TEXT,
    status VARCHAR(20) DEFAULT 'searching' CHECK (status IN ('searching','assigned','arrived','in_progress','completed','cancelled_by_passenger','cancelled_by_driver')),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    rating_passenger INTEGER CHECK (rating_passenger BETWEEN 1 AND 5),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE driver_locations (
    driver_id INTEGER PRIMARY KEY REFERENCES drivers(user_id) ON DELETE CASCADE,
    lat DECIMAL(10,8),
    lng DECIMAL(11,8),
    heading INTEGER,
    speed DECIMAL(6,2),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER REFERENCES drivers(user_id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE websocket_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    event_type VARCHAR(50),
    payload JSONB,
    direction VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW()
);
