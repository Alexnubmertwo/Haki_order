package com.haki.pos.model;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tovar (produkt) v sisteme Haki.
 * Cena mojet zaviset ot razmera (M/L) - togda zapolnyaetsya prices,
 * ili byt' odna - togda ispol'zuetsya prices.get("BASE").
 */
public class Product {

    private String id;
    private String name;
    private String category;
    private String imageUrl;       // mojet byt' null
    private Map<String, Integer> prices = new LinkedHashMap<>(); // razmer -> cena (UZS)
    private int stockQty;          // ostatok na sklade
    private int minStockQty;       // porog dlya predupreghdeniya "zakanchivaetsya"
    private String unit = "sht";   // edinica izmereniya: sht, l, kg...

    public Product() {
    }

    public Product(String id, String name, String category,
                    Map<String, Integer> prices, int stockQty, int minStockQty, String unit) {
        this.id = id;
        this.name = name;
        this.category = category;
        this.prices = prices;
        this.stockQty = stockQty;
        this.minStockQty = minStockQty;
        this.unit = unit;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }

    public Map<String, Integer> getPrices() { return prices; }
    public void setPrices(Map<String, Integer> prices) { this.prices = prices; }

    public int getStockQty() { return stockQty; }
    public void setStockQty(int stockQty) { this.stockQty = stockQty; }

    public int getMinStockQty() { return minStockQty; }
    public void setMinStockQty(int minStockQty) { this.minStockQty = minStockQty; }

    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit; }

    public boolean isLowStock() {
        return stockQty <= minStockQty;
    }
}
