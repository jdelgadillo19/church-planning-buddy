on run argv
	if (count of argv) < 2 then
		error "Usage: osascript export-playlist.applescript <playlistName> <outputPosixPath>"
	end if

	set playlistName to item 1 of argv
	set outputPosixPath to item 2 of argv

	tell application "ProPresenter" to activate
	delay 0.5

	tell application "System Events"
		tell process "ProPresenter"
			set frontmost to true
			delay 0.3
			try
				click menu item "Playlist…" of menu "Export" of menu item "Export" of menu "File" of menu bar 1
			on error
				try
					click menu item "Playlist..." of menu "Export" of menu item "Export" of menu "File" of menu bar 1
				on error errMsg
					error "Could not open File → Export → Playlist: " & errMsg
				end try
			end try
		end tell
	end tell

	delay 0.8

	tell application "System Events"
		tell process "ProPresenter"
			set frontmost to true
			repeat with w in windows
				if (name of w) contains "Export" or (name of w) contains "Save" then
					exit repeat
				end if
			end repeat
		end tell
	end tell

	delay 0.3

	tell application "System Events"
		keystroke "G" using {command down, shift down}
	end tell
	delay 0.4

	set parentPosix to do shell script "dirname " & quoted form of outputPosixPath
	set baseName to do shell script "basename " & quoted form of outputPosixPath

	tell application "System Events"
		keystroke parentPosix
		delay 0.2
		key code 36
		delay 0.5
		keystroke "a" using command down
		delay 0.1
		keystroke baseName
		delay 0.2
		key code 36
	end tell

	delay 1.2
	return "ok"
end run
