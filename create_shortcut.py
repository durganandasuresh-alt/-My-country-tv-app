"""Creates a Windows desktop shortcut for My Country TV with the app logo.

Uses the generated app.ico so the shortcut shows the branded icon, and sets
it to launch MyCountryTV.bat (which starts the Flask + WebView2 app silently).
"""
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
BAT = os.path.join(BASE, "MyCountryTV.bat")
ICO = os.path.join(BASE, "static", "img", "app.ico")

desktop = os.path.join(os.path.expanduser("~"), "Desktop")
# OneDrive often redirects the desktop
onedrive_desktop = os.path.join(os.path.expanduser("~"), "OneDrive", "Desktop")
if os.path.isdir(onedrive_desktop):
    desktop = onedrive_desktop

lnk = os.path.join(desktop, "My Country TV.lnk")

try:
    import pythoncom
    from win32com.client import Dispatch
except ImportError:
    print("Installing pywin32 (needed to create the shortcut)...")
    os.system(f'"{sys.executable}" -m pip install pywin32')
    import pythoncom
    from win32com.client import Dispatch

pythoncom.CoInitialize()
shell = Dispatch("WScript.Shell")
shortcut = shell.CreateShortCut(lnk)
shortcut.TargetPath = BAT
shortcut.WorkingDirectory = BASE
shortcut.IconLocation = ICO
shortcut.Description = "My Country TV - Live TV Channels, Shows & Movies"
shortcut.Save()

print(f"[+] Desktop shortcut created: {lnk}")
