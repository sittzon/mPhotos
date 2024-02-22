import React, { useState } from 'react';
import './DropdownMenu.css';

const DropdownMenu = (props) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="dropdown">
      <button onClick={toggleMenu}>
        <img src="./dots-three-circle.svg" width="40px" alt="Menu"/>
      </button>
      {isOpen && (
        <div className="dropdown-menu">
          <ul>
            <li >
                <button onClick={() => {
                    props.toggleColumns(); 
                    setIsOpen(false)}}>Zoom</button>
            </li>
            <li >
                <button onClick={() => {
                    props.sortByDate(); 
                    setIsOpen(false)}}>Sort by date</button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default DropdownMenu;
