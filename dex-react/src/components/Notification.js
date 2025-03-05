import React from 'react';

function Notification({ notification }) {
  if (!notification.message) return null;
  const style = {
    backgroundColor: notification.type === 'success' ? '#4caf50' : notification.type === 'error' ? '#f44336' : '#2c2c2c'
  };
  return (
    <div className="notification" style={style}>
      {notification.message}
    </div>
  );
}

export default Notification;