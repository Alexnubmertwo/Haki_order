package uz.haki.pos;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.ViewGroup;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

/**
 * Haki POS: приложение-оболочка. Показывает веб-интерфейс сервера внутри приложения.
 * Адрес сервера хранится в настройках приложения; при первом запуске его нужно ввести.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "haki";
    private static final String KEY_URL = "server_url";

    private WebView web;
    private ProgressBar bar;
    private SharedPreferences prefs;
    private String serverUrl = "";
    private boolean errorShown = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, (int) (4 * getResources().getDisplayMetrics().density));
        root.addView(bar, lp);
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                String host = Uri.parse(serverUrl).getHost();
                if (host != null && host.equalsIgnoreCase(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap favicon) {
                errorShown = false;
                bar.setVisibility(android.view.View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                bar.setVisibility(android.view.View.GONE);
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showConnectionError();
            }
        });

        // WebView по умолчанию игнорирует alert/confirm/prompt, а интерфейс ими пользуется.
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView v, int p) {
                bar.setProgress(p);
            }

            @Override
            public boolean onJsAlert(WebView v, String url, String msg, JsResult r) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(msg)
                        .setPositiveButton(android.R.string.ok, (d, w) -> r.confirm())
                        .setOnCancelListener(d -> r.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView v, String url, String msg, JsResult r) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(msg)
                        .setPositiveButton(android.R.string.ok, (d, w) -> r.confirm())
                        .setNegativeButton(android.R.string.cancel, (d, w) -> r.cancel())
                        .setOnCancelListener(d -> r.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView v, String url, String msg, String def, JsPromptResult r) {
                EditText input = new EditText(MainActivity.this);
                input.setSingleLine(true);
                if (def != null) input.setText(def);
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(msg)
                        .setView(input)
                        .setPositiveButton(android.R.string.ok, (d, w) -> r.confirm(input.getText().toString()))
                        .setNegativeButton(android.R.string.cancel, (d, w) -> r.cancel())
                        .setOnCancelListener(d -> r.cancel())
                        .show();
                return true;
            }
        });

        serverUrl = prefs.getString(KEY_URL, BuildConfig.DEFAULT_URL);
        if (serverUrl == null || serverUrl.trim().isEmpty()) {
            askServerUrl(false);
        } else {
            web.loadUrl(serverUrl);
        }
    }

    private static String normalize(String raw) {
        String u = raw == null ? "" : raw.trim();
        if (u.isEmpty()) return "";
        if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
        return u;
    }

    private void askServerUrl(boolean cancelable) {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("https://haki-xxxx.onrender.com");
        if (serverUrl != null) input.setText(serverUrl);
        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle("Адрес сервера")
                .setView(input)
                .setCancelable(cancelable)
                .setPositiveButton("Сохранить", (d, w) -> {
                    String u = normalize(input.getText().toString());
                    if (u.isEmpty()) {
                        askServerUrl(cancelable);
                        return;
                    }
                    serverUrl = u;
                    prefs.edit().putString(KEY_URL, u).apply();
                    web.loadUrl(u);
                });
        if (cancelable) b.setNegativeButton(android.R.string.cancel, null);
        b.show();
    }

    private void showConnectionError() {
        if (errorShown) return;
        errorShown = true;
        bar.setVisibility(android.view.View.GONE);
        new AlertDialog.Builder(this)
                .setTitle("Нет связи с сервером")
                .setMessage("Проверьте интернет. Если сервер только что проснулся, подождите минуту и повторите.")
                .setCancelable(false)
                .setPositiveButton("Повторить", (d, w) -> {
                    errorShown = false;
                    web.loadUrl(serverUrl);
                })
                .setNegativeButton("Сменить адрес", (d, w) -> {
                    errorShown = false;
                    askServerUrl(true);
                })
                .show();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
