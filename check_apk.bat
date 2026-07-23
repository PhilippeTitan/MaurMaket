@echo off
if exist "C:\MAURINEX\Maurinex Projects\New folder\MaurMaket\android\app\build\outputs\apk\release\app-release.apk" (
    echo APK_EXISTS
    dir "C:\MAURINEX\Maurinex Projects\New folder\MaurMaket\android\app\build\outputs\apk\release\app-release.apk"
) else (
    echo APK_NOT_FOUND
)
