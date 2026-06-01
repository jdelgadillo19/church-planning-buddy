on run argv
	if (count of argv) < 2 then
		error "Usage: osascript send-message.applescript <groupName> <messageText> [send|draft]"
	end if

	set groupName to item 1 of argv
	set messageText to item 2 of argv
	set sendMode to "draft"
	if (count of argv) ≥ 3 then set sendMode to item 3 of argv

	tell application "System Events"
		set wasWhatsAppAlreadyOpen to (exists process "WhatsApp")
	end tell

	tell application "WhatsApp" to activate

	tell application "System Events"
		repeat until exists process "WhatsApp"
			delay 0.1
		end repeat

		tell process "WhatsApp"
			set frontmost to true
			delay 2
		end tell
	end tell

	tell application "System Events"
		tell process "WhatsApp"
			set frontmost to true

			keystroke "f" using {command down}
			delay 0.5

			set the clipboard to groupName
			keystroke "a" using {command down}
			delay 0.1
			keystroke "v" using {command down}
			delay 1

			key code 125
			delay 0.1
			key code 125
			delay 0.1
			key code 76
			delay 0.7

			set the clipboard to messageText
			keystroke "a" using {command down}
			delay 0.1
			keystroke "v" using {command down}
			delay 0.1

			if sendMode is "send" then
				key code 36
				delay 0.2
			end if

			if not wasWhatsAppAlreadyOpen then
				tell application "WhatsApp" to quit
			end if
		end tell
	end tell
end run
