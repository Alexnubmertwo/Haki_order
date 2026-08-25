package com.haki.desktop;

import com.haki.pos.HakiApplication;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.geometry.Rectangle2D;
import javafx.scene.Scene;
import javafx.scene.web.WebView;
import javafx.stage.Screen;
import javafx.stage.Stage;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * Haki Desktop - "prilojenie-versiya" Haki.
 * Vnutri zapuskaetsya tot je Spring Boot backend (kak i dlya veb-versii),
 * no vmesto brauzera interfeys otkryvaetsya v otdel'nom okne cherez JavaFX WebView.
 * Odna kodovaya baza (Java) -> i veb, i desktop.
 */
public class HakiDesktopApp extends Application {

    private static ConfigurableApplicationContext springContext;
    private static final String APP_URL = "http://localhost:8080/";

    public static void main(String[] args) {
        // zapuskaem Spring Boot backend v fone PERED otkrytiem okna
        springContext = SpringApplication.run(HakiApplication.class, args);
        launch(args);
    }

    @Override
    public void start(Stage stage) {
        WebView webView = new WebView();
        webView.getEngine().load(APP_URL);

        Rectangle2D screen = Screen.getPrimary().getVisualBounds();
        Scene scene = new Scene(webView, screen.getWidth() * 0.85, screen.getHeight() * 0.85);

        stage.setTitle("Haki — POS и склад");
        stage.setScene(scene);
        stage.show();
    }

    @Override
    public void stop() {
        if (springContext != null) {
            springContext.close();
        }
        Platform.exit();
        System.exit(0);
    }
}
