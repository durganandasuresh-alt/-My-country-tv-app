package com.mycountrytv.app;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

/**
 * My Country TV - Native Android TV & Mobile WebView Application
 * Features:
 *  - Auto-Padding & Auto-Adjust Full Screen for mobile notch/display cutouts
 *  - Edge-to-Edge Immersive Sticky Fullscreen navigation
 *  - Dual Network Support (LAN Home Wi-Fi & WAN Public Internet) with auto-fallback
 *  - Orientation auto-adjust: Landscape triggers full-bleed video canvas
 *  - HLS / M3U8 Live Stream hardware acceleration
 *  - Android TV remote D-Pad & Back button support
 */
public class MainActivity extends AppCompatActivity {

    private static final String PREFS_NAME = "MyCountryTvPrefs";
    private static final String KEY_LAN_URL = "server_lan_url";
    private static final String KEY_WAN_URL = "server_wan_url";
    private static final String KEY_ACTIVE_NET_MODE = "active_net_mode"; // "lan" or "wan"
    
    private static final String DEFAULT_LAN_URL = "http://10.153.49.149:5000";
    private static final String DEFAULT_WAN_URL = "http://152.57.128.130:5000";

    private FrameLayout rootContainer;
    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout loadingLayout;
    private TextView txtLoadingStatus;
    private LinearLayout errorLayout;
    private Button btnRetry, btnChangeIp;
    private Button btnOfflineStructure, btnAutoDetectIp, btnSwitchWan;
    private TextView txtNetworkStatus, txtIpStatus;
    private FrameLayout customViewContainer;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private View customView;

    private SharedPreferences prefs;
    private boolean isAttemptingFallback = false;
    private int originalOrientation;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Configure Edge-to-Edge and Notch Cutout full display
        setupWindowEdgeToEdge();

        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        rootContainer = findViewById(R.id.rootContainer);
        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        loadingLayout = findViewById(R.id.loadingLayout);
        txtLoadingStatus = findViewById(R.id.txtLoadingStatus);
        errorLayout = findViewById(R.id.errorLayout);
        btnRetry = findViewById(R.id.btnRetry);
        btnChangeIp = findViewById(R.id.btnChangeIp);
        btnOfflineStructure = findViewById(R.id.btnOfflineStructure);
        btnAutoDetectIp = findViewById(R.id.btnAutoDetectIp);
        btnSwitchWan = findViewById(R.id.btnSwitchWan);
        txtNetworkStatus = findViewById(R.id.txtNetworkStatus);
        txtIpStatus = findViewById(R.id.txtIpStatus);
        customViewContainer = findViewById(R.id.customViewContainer);

        // Apply auto-padding for display cutouts / safe insets dynamically
        setupAutoPadding();

        setupWebView();

        btnRetry.setOnClickListener(v -> {
            isAttemptingFallback = false;
            loadServer();
        });
        btnChangeIp.setOnClickListener(v -> showDualNetworkSettingsDialog());

        if (btnOfflineStructure != null) {
            btnOfflineStructure.setOnClickListener(v -> loadOfflineStructure());
        }
        if (btnAutoDetectIp != null) {
            btnAutoDetectIp.setOnClickListener(v -> autoDetectAndSetIp(true));
        }
        if (btnSwitchWan != null) {
            btnSwitchWan.setOnClickListener(v -> switchToWanAndRun());
        }

        // Run auto-discovery in background
        autoDetectAndSetIp(false);

        loadServer();
    }

    /**
     * Configures Edge-to-Edge layout so video & web UI fill 100% of the screen
     * seamlessly without black bars on notch and hole-punch displays.
     */
    private void setupWindowEdgeToEdge() {
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Allow drawing into display cutout (Notch / Camera Hole) on Android 9.0 (Pie) and above
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        // Enable edge-to-edge system bar decor
        WindowCompat.setDecorFitsSystemWindows(window, false);

        // Apply Immersive Sticky Fullscreen
        applyImmersiveSticky();
    }

    /**
     * Hides Navigation Bar & Status Bar with Immersive Sticky mode.
     * When user swipes edge, bars briefly appear as translucent and auto-hide.
     */
    private void applyImmersiveSticky() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            View decorView = getWindow().getDecorView();
            int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
            decorView.setSystemUiVisibility(flags);
        }
    }

    /**
     * Auto-adjusts padding dynamically based on screen insets and display cutouts:
     * Dispatches actual notch / cutout / gesture navigation bar insets directly
     * into CSS custom properties (--safe-top, --safe-bottom, --safe-left, --safe-right)
     * so that the entire full-screen layout fits seamlessly with zero letterboxing
     * and automatic padding around notches, hole-punch cameras, and gesture pill bars.
     */
    private void setupAutoPadding() {
        if (rootContainer != null) {
            ViewCompat.setOnApplyWindowInsetsListener(rootContainer, (v, insets) -> {
                // Ensure container fills 100% of the display edge-to-edge
                v.setPadding(0, 0, 0, 0);

                // Calculate safe insets in screen pixels
                androidx.core.graphics.Insets systemBarInsets = insets.getInsets(
                        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );

                float density = getResources().getDisplayMetrics().density;
                if (density <= 0) density = 1.0f;

                int topDp = Math.round(systemBarInsets.top / density);
                int bottomDp = Math.round(systemBarInsets.bottom / density);
                int leftDp = Math.round(systemBarInsets.left / density);
                int rightDp = Math.round(systemBarInsets.right / density);

                int orientation = getResources().getConfiguration().orientation;
                boolean isLandscape = (orientation == Configuration.ORIENTATION_LANDSCAPE);

                if (webView != null) {
                    final String js = String.format(java.util.Locale.US,
                            "if (window.setAndroidAppInsets) { window.setAndroidAppInsets(%d, %d, %d, %d, %b); }",
                            topDp, bottomDp, leftDp, rightDp, isLandscape);
                    webView.post(() -> webView.evaluateJavascript(js, null));
                }

                return insets;
            });
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(true);
        
        // Auto-Adjust Viewport Scaling for all mobile screen sizes & densities
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        ws.setSupportZoom(false);
        ws.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NORMAL);
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Security and file access configs
        ws.setAllowFileAccessFromFileURLs(true);
        ws.setAllowUniversalAccessFromFileURLs(true);

        // Hardware-accelerate rendering
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setBackgroundColor(Color.parseColor("#0b0c15"));

        // Modern Chrome User-Agent with Mobile Auto-Adjust flag
        String defaultUa = ws.getUserAgentString();
        ws.setUserAgentString(defaultUa + " MyCountryTV-AndroidApp/2.1 (Mobile-AutoAdjust-Fullscreen)");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
                errorLayout.setVisibility(View.GONE);
                if (txtLoadingStatus != null) {
                    txtLoadingStatus.setText("Connecting to: " + url + "...");
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                if (loadingLayout != null) {
                    loadingLayout.setVisibility(View.GONE);
                }
                webView.setVisibility(View.VISIBLE);
                isAttemptingFallback = false;
                applyImmersiveSticky();

                // Trigger insets re-application to ensure CSS safe-area variables are populated immediately
                if (rootContainer != null) {
                    ViewCompat.requestApplyInsets(rootContainer);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    progressBar.setVisibility(View.GONE);
                    handleConnectionFailure();
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // Support older Android WebView versions
                progressBar.setVisibility(View.GONE);
                handleConnectionFailure();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                originalOrientation = getRequestedOrientation();

                webView.setVisibility(View.GONE);
                customViewContainer.setVisibility(View.VISIBLE);
                customViewContainer.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

                // Auto-adjust to landscape for fullscreen video playback
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                applyImmersiveSticky();
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                webView.setVisibility(View.VISIBLE);
                customViewContainer.setVisibility(View.GONE);
                customViewContainer.removeView(customView);
                customView = null;
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                }

                // Restore orientation
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                applyImmersiveSticky();
            }
        });
    }

    private void loadServer() {
        String activeMode = prefs.getString(KEY_ACTIVE_NET_MODE, "lan");
        String urlToLoad;
        if ("wan".equalsIgnoreCase(activeMode)) {
            urlToLoad = prefs.getString(KEY_WAN_URL, DEFAULT_WAN_URL);
        } else {
            urlToLoad = prefs.getString(KEY_LAN_URL, DEFAULT_LAN_URL);
        }

        errorLayout.setVisibility(View.GONE);
        if (loadingLayout != null) {
            loadingLayout.setVisibility(View.VISIBLE);
        }
        if (txtLoadingStatus != null) {
            txtLoadingStatus.setText("Connecting to " + activeMode.toUpperCase() + ": " + urlToLoad + "...");
        }
        webView.loadUrl(urlToLoad);
    }

    private void handleConnectionFailure() {
        String activeMode = prefs.getString(KEY_ACTIVE_NET_MODE, "lan");

        // Smart auto-fallback: if LAN fails and haven't tried WAN, attempt WAN fallback
        if ("lan".equalsIgnoreCase(activeMode) && !isAttemptingFallback) {
            isAttemptingFallback = true;
            String wanUrl = prefs.getString(KEY_WAN_URL, DEFAULT_WAN_URL);
            prefs.edit().putString(KEY_ACTIVE_NET_MODE, "wan").apply();
            if (txtLoadingStatus != null) {
                txtLoadingStatus.setText("Switching to WAN (Public IP): " + wanUrl + "...");
            }
            webView.loadUrl(wanUrl);
            return;
        }

        if (loadingLayout != null) {
            loadingLayout.setVisibility(View.GONE);
        }
        errorLayout.setVisibility(View.VISIBLE);
        updateStatusLabels();
    }

    private void updateStatusLabels() {
        if (txtNetworkStatus != null) {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo netInfo = cm != null ? cm.getActiveNetworkInfo() : null;
            boolean isConnected = netInfo != null && netInfo.isConnected();
            String typeName = netInfo != null ? netInfo.getTypeName() : "None";
            txtNetworkStatus.setText(isConnected ? "📶 Network: " + typeName + " (Server unreachable)" : "❌ No Internet Connection");
            txtNetworkStatus.setTextColor(isConnected ? Color.parseColor("#f59e0b") : Color.parseColor("#ef4444"));
        }
        if (txtIpStatus != null) {
            String activeMode = prefs.getString(KEY_ACTIVE_NET_MODE, "lan");
            String activeUrl = activeMode.equalsIgnoreCase("wan") ? prefs.getString(KEY_WAN_URL, DEFAULT_WAN_URL) : prefs.getString(KEY_LAN_URL, DEFAULT_LAN_URL);
            txtIpStatus.setText("Active " + activeMode.toUpperCase() + ": " + activeUrl);
        }
    }

    /**
     * Fallback to bundled offline HTML that displays TV structure, channel matrix, categories and player layout.
     */
    private void loadOfflineStructure() {
        if (loadingLayout != null) {
            loadingLayout.setVisibility(View.GONE);
        }
        errorLayout.setVisibility(View.GONE);
        webView.loadUrl("file:///android_asset/index.html");
        Toast.makeText(this, "📺 Showing TV Structure in Offline Mode", Toast.LENGTH_SHORT).show();
    }

    /**
     * Auto sets IP address based on subnet detection and tests connection.
     */
    private void autoDetectAndSetIp(boolean showFeedback) {
        if (showFeedback) {
            Toast.makeText(this, "🔍 Auto-detecting server IP on network...", Toast.LENGTH_SHORT).show();
        }
        new Thread(() -> {
            String detectedIp = null;
            try {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                NetworkInfo netInfo = cm != null ? cm.getActiveNetworkInfo() : null;
                if (netInfo != null && netInfo.getType() == ConnectivityManager.TYPE_WIFI) {
                    android.net.wifi.WifiManager wm = (android.net.wifi.WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                    if (wm != null) {
                        int ipInt = wm.getConnectionInfo().getIpAddress();
                        if (ipInt != 0) {
                            String myDeviceIp = String.format("%d.%d.%d.%d",
                                    (ipInt & 0xff),
                                    (ipInt >> 8 & 0xff),
                                    (ipInt >> 16 & 0xff),
                                    (ipInt >> 24 & 0xff));
                            // Extract subnet e.g. 192.168.1. or 10.153.49.
                            int lastDot = myDeviceIp.lastIndexOf('.');
                            if (lastDot > 0) {
                                String subnet = myDeviceIp.substring(0, lastDot + 1);
                                // Default gateway / router usually ends in .1 or PC commonly .5, .18, .149
                                String[] candidates = new String[]{
                                        prefs.getString(KEY_LAN_URL, DEFAULT_LAN_URL),
                                        "http://" + subnet + "149:5000",
                                        "http://" + subnet + "5:5000",
                                        "http://" + subnet + "18:5000",
                                        "http://" + subnet + "1:5000"
                                };
                                for (String cand : candidates) {
                                    if (pingUrl(cand + "/api/server-info")) {
                                        detectedIp = cand;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}

            final String resolvedUrl = detectedIp;
            runOnUiThread(() -> {
                if (resolvedUrl != null) {
                    prefs.edit().putString(KEY_LAN_URL, resolvedUrl).putString(KEY_ACTIVE_NET_MODE, "lan").apply();
                    if (txtIpStatus != null) {
                        txtIpStatus.setText("⚡ Auto Set IP: " + resolvedUrl);
                    }
                    if (showFeedback) {
                        Toast.makeText(MainActivity.this, "✅ Connected to: " + resolvedUrl, Toast.LENGTH_SHORT).show();
                        loadServer();
                    }
                } else if (showFeedback) {
                    Toast.makeText(MainActivity.this, "Could not reach LAN server. Trying WAN network...", Toast.LENGTH_SHORT).show();
                    switchToWanAndRun();
                }
            });
        }).start();
    }

    private boolean pingUrl(String urlStr) {
        try {
            java.net.URL u = new java.net.URL(urlStr);
            java.net.HttpURLConnection conn = (java.net.HttpURLConnection) u.openConnection();
            conn.setConnectTimeout(800);
            conn.setReadTimeout(800);
            conn.setRequestMethod("GET");
            int code = conn.getResponseCode();
            conn.disconnect();
            return (code >= 200 && code < 400);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Automatically switches active network mode to WAN and launches TV app over mobile data / internet.
     */
    private void switchToWanAndRun() {
        String wanUrl = prefs.getString(KEY_WAN_URL, DEFAULT_WAN_URL);
        prefs.edit().putString(KEY_ACTIVE_NET_MODE, "wan").apply();
        isAttemptingFallback = false;
        Toast.makeText(this, "🌍 Running with WAN Network: " + wanUrl, Toast.LENGTH_SHORT).show();
        loadServer();
    }

    private void showDualNetworkSettingsDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("Dual Network Settings (LAN & WAN)");

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(40, 20, 40, 10);

        TextView labelMode = new TextView(this);
        labelMode.setText("Select Network Connection Mode:");
        labelMode.setTextSize(14);
        layout.addView(labelMode);

        RadioGroup radioGroup = new RadioGroup(this);
        RadioButton rbLan = new RadioButton(this);
        rbLan.setText("🏠 LAN Mode (Home Wi-Fi router)");
        RadioButton rbWan = new RadioButton(this);
        rbWan.setText("🌍 WAN Mode (Internet / Mobile 4G/5G)");

        String currentMode = prefs.getString(KEY_ACTIVE_NET_MODE, "lan");
        if ("wan".equalsIgnoreCase(currentMode)) {
            rbWan.setChecked(true);
        } else {
            rbLan.setChecked(true);
        }
        radioGroup.addView(rbLan);
        radioGroup.addView(rbWan);
        layout.addView(radioGroup);

        TextView labelLan = new TextView(this);
        labelLan.setText("\nLocal LAN URL (Wi-Fi):");
        layout.addView(labelLan);

        final EditText inputLan = new EditText(this);
        inputLan.setText(prefs.getString(KEY_LAN_URL, DEFAULT_LAN_URL));
        layout.addView(inputLan);

        TextView labelWan = new TextView(this);
        labelWan.setText("\nPublic WAN URL (Internet):");
        layout.addView(labelWan);

        final EditText inputWan = new EditText(this);
        inputWan.setText(prefs.getString(KEY_WAN_URL, DEFAULT_WAN_URL));
        layout.addView(inputWan);

        builder.setView(layout);

        builder.setPositiveButton("Save & Connect", (dialog, which) -> {
            String selectedMode = rbWan.isChecked() ? "wan" : "lan";

            String lanVal = cleanUrl(inputLan.getText().toString().trim());
            String wanVal = cleanUrl(inputWan.getText().toString().trim());

            prefs.edit()
                    .putString(KEY_ACTIVE_NET_MODE, selectedMode)
                    .putString(KEY_LAN_URL, lanVal)
                    .putString(KEY_WAN_URL, wanVal)
                    .apply();

            isAttemptingFallback = false;
            String msg = "Connecting via " + selectedMode.toUpperCase() + ": " +
                    (selectedMode.equals("wan") ? wanVal : lanVal);
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
            loadServer();
        });

        builder.setNegativeButton("Cancel", (dialog, which) -> dialog.cancel());
        builder.show();
    }

    private String cleanUrl(String url) {
        if (url.isEmpty()) return DEFAULT_LAN_URL;
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://" + url;
        }
        if (!url.contains(":5000") && !url.startsWith("https://") && !url.split("://")[1].contains("/")) {
            url = url + ":5000";
        }
        return url;
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyImmersiveSticky();
        if (rootContainer != null) {
            ViewCompat.requestApplyInsets(rootContainer);
        }
        // Notify webView to auto-adjust viewport layout upon screen rotation
        if (webView != null) {
            webView.evaluateJavascript("if(window.handleAppOrientationChange) window.handleAppOrientationChange();", null);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersiveSticky();
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (customView != null) {
                // Exit fullscreen video
                if (webView.getWebChromeClient() != null) {
                    webView.getWebChromeClient().onHideCustomView();
                }
                return true;
            }
            if (webView.canGoBack()) {
                webView.goBack();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        applyImmersiveSticky();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        webView.destroy();
    }
}
