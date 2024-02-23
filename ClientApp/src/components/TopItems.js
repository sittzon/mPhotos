import React, { useState } from 'react';
import './TopItems.css';

const TopItems = (props) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="fixed">
      
      <div className="info-and-menu">
        <p className="no-photos">{props.noPhotos} photos</p>
        <button className="menu-button" onClick={toggleMenu}>
          <img src="./dots-three-circle.svg" alt="Menu"/>
        </button>
      </div>

      {isOpen && (
        <div className="dropdown-menu-container">
          <div className="dropdown-menu">
            <ul>
              <li>
                  <button onClick={() => {
                    props.toggleColumns(); 
                    setIsOpen(false)}}>Zoom</button>
              </li>
              <li>
                  <button onClick={() => {
                    props.sortByDate(); 
                    setIsOpen(false)}}>Sort by date</button>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default TopItems;
