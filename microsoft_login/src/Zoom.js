import React, { useEffect, useState } from 'react';
import './Zoom.css';

const Zoom = ({ onComplete }) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
      if (onComplete) {
        onComplete();
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="zoom-page">
      {loading && (
        <>
          <div className="loading-circle"></div>
          <p className="loading-text">Joining meeting</p>
        </>
      )}
    </div>
  );
};

export default Zoom;