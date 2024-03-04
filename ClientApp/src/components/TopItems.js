import React, { useEffect, useState, useRef } from 'react';
import './TopItems.css';

const TopItems = (props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filterDateIsOpen, setFilterDateIsOpen] = useState(false);
  
  // const [startDate, setStartDate] = useState((new Date()).toISOString().split('T').shift());
  // const [endDate, setEndDate] = useState((new Date()).toISOString().split('T').shift());

  useEffect(() => { 
    window.addEventListener('scroll', handleScroll);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleScroll = async () => {
    setIsOpen(false);
  };
  
  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };
  
  // const toggleDatePicker = () => {
  //   setFilterDateIsOpen(!filterDateIsOpen);
  // };

  const buttons = [
    { name: 'Zoom', action: props.toggleColumns, closeAfterAction: false, icon: './magnifier.svg' },
    { name: 'Next page', action: props.nextPage, closeAfterAction: false, icon: './right-arrow-2.svg'},
    { name: 'Prev page', action: props.prevPage, closeAfterAction: false, icon: './left-arrow-2.svg'},
    { name: 'Reverse sort', action: props.sortByDate, closeAfterAction: true },
    // { name: 'Filter date', action: toggleDatePicker, closeAfterAction: true }
  ]

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
              {buttons.map((button, index) => (
                <li key={index}>
                  <button onClick={() => {
                    button.action();
                    if (button.closeAfterAction) {
                      setIsOpen(false);
                    }
                  }}>
                    {button.icon &&
                      <img src={button.icon} 
                        alt={button.name} 
                        width="20px" 
                        style={{marginRight: '15px'}} 
                        loading='eager'
                        fetchpriority='high'
                      /> 
                    }
                    {button.name}
                  </button>
                </li>
              ))}

              {/* <li>
                  <button onClick={() => {props.nextPage();}}>
                    <img src="./right_arrow.svg" alt="Next page" width="20px"/>
                    Next page
                    </button>
              </li>
              <li>
                  <button onClick={() => {props.prevPage();}}>
                    <img src="./left_arrow.svg" alt="Next page" width="20px"/>
                    Prev page
                    </button>
              </li>
              <li>
                  <button onClick={() => {
                    props.toggleColumns(); 
                    setIsOpen(false)}}>Zoom</button>
              </li>
              <li>
                  <button onClick={() => {
                    props.sortByDate(); 
                    setIsOpen(false)}}>Reverse sort</button>
              </li> */}

              {/* <li>
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
              </li> */}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default TopItems;
