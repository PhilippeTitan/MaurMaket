# MaurMaket Database Schema

This schema is designed to run on a serverless Postgres database (like Neon) to power Victoria's mobile food-ordering app.

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table for Menu categories (e.g. Burgers, Wings, Drinks)
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    icon VARCHAR(50), -- name of the icon (SVG or feather/heroicons)
    display_order INT DEFAULT 0
);

-- Table for Menu items
CREATE TABLE menu_items (
    id SERIAL PRIMARY KEY,
    category_id INT REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL, -- USD or HTG
    image_url TEXT,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for Orders
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_classroom VARCHAR(50), -- Classroom/location at the school
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, paid, preparing, ready, completed, cancelled
    moncash_reference VARCHAR(150) UNIQUE,
    moncash_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for Order items (join table menu_items <-> orders)
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INT REFERENCES menu_items(id) ON DELETE SET NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    price DECIMAL(10, 2) NOT NULL -- Price at time of purchase
);

-- Seed data for testing
INSERT INTO categories (name, icon, display_order) VALUES
('Plats', 'utensils', 1),
('Boissons', 'coffee', 2),
('Desserts', 'pie-chart', 3);

INSERT INTO menu_items (category_id, name, description, price, image_url, is_available) VALUES
(1, 'Burgers Spéciaux', 'Pain brioché, bœuf juteux, fromage fondant, frites croquantes.', 15.00, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80', true),
(1, 'Ailes de poulet BBQ', '8 pièces d''ailes glacées sauce BBQ, servies avec frites.', 12.00, 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=500&q=80', true),
(2, 'Limonade Fraîche', 'Limonade maison pressée à froid.', 3.00, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80', true),
(3, 'Cookies Chocolat', 'Cookies moelleux aux pépites de chocolat belge.', 4.00, 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=500&q=80', true);
```
