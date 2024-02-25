import React, { useEffect, useState, useRef } from 'react';
import './TopItems.css';

const TopItems = (props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filterDateIsOpen, setFilterDateIsOpen] = useState(false);
  
  const [startDate, setStartDate] = useState((new Date()).toISOString().split('T').shift());
  const [endDate, setEndDate] = useState((new Date()).toISOString().split('T').shift());
  
  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };
  
  const toggleDatePicker = () => {
    setFilterDateIsOpen(!filterDateIsOpen);
  };

  return (
    <div className="fixed">
      
      <div className="info-and-menu">
        <p className="text-rounded-corners">{props.noPhotos} photos</p>
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
                    setIsOpen(false)}}>Reverse sort</button>
              </li>
              <li>
                <div>
                  <button onClick={() => {
                    toggleDatePicker();
                    }}>Filter date
                  </button>           
                  {filterDateIsOpen && 
                  <div>
                    <span>From </span>
                    <input 
                      aria-label="Filter start date" 
                      type="date"
                      id="filterStartDate" 
                      defaultValue={props.startDate}
                      onChange={() => {
                        props.filterByDates();
                        toggleDatePicker();
                      }}
                      />
                    <span>To </span>
                     <input 
                       aria-label="Filter end date" 
                       type="date"
                       id="filterEndDate" 
                       defaultValue={endDate}
                       onChange={() => {
                          props.filterByDates();
                          toggleDatePicker();
                        }}
                     />
                    </div>
                  }
                </div>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default TopItems;
