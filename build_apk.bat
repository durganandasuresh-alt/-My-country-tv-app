@echo off
set JAVA_HOME=C:\Users\dell2\jdk-17
set ANDROID_HOME=C:\Users\dell2\.bubblewrap\android_sdk
set PATH=C:\Users\dell2\jdk-17\bin;C:\Users\dell2\gradle-8.5\bin;%PATH%
cd /d "c:\Users\dell2\OneDrive\Documents\pythontv\pythontv.py\android-source"
gradle assembleDebug --no-daemon --stacktrace
