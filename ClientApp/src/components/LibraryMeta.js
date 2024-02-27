import React, { useEffect, useState } from 'react';

const LibraryMeta = () => {
  const [ metaData, setMetadata ] = useState([]);

  useEffect(() => {
    populateData();
  }, []);
  
  const populateData = async ()=> {
    const response = await fetch('photos/metadata');
    const data = await response.json();
    setMetadata(data);
  }

  return (
    <div className="white-bkg">
      <h1 id="tableLabel">Photos metadata</h1>
      <p>{metaData.length} photos indexed</p>
      <table className="table table-striped" aria-labelledby="tableLabel">
        <thead>
          <tr key="header">
            <th>Guid</th>
            <th>Name</th>
            <th>Size (kB)</th>
            <th>Date Taken</th>
            <th>Width</th>
            <th>Height</th>
          </tr>
        </thead>
        <tbody>
          {metaData.map(currentMetadata =>
            <tr key={currentMetadata.guid}>
              <td>{currentMetadata.guid}</td>
              <td>{currentMetadata.name}</td>
              <td>{currentMetadata.sizeKb}</td>
              <td>{currentMetadata.dateTaken}</td>
              <td>{currentMetadata.width}</td>
              <td>{currentMetadata.height}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default LibraryMeta;