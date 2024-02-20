import React, { Component, useState } from 'react';
import ModalImage from "react-modal-image";
// import { useHotkeys } from 'react-hotkeys-hook'
import './Home.css';

export class Home extends Component {
  static displayName = Home.name;

  constructor(props) {
    super(props);
    this.state = { images: [], metaData: [], showImageName: false, loading: true, sortOrder: false, columns: 3};
    this.toggleImageName = this.toggleImageName.bind(this);
    this.sortImagesByDate = this.sortImagesByDate.bind(this);
    this.toggleColumns = this.toggleColumns.bind(this);
  }

  componentDidMount() {
    this.populateData();
  }
  
  static groupByN = (n, arr) => {
    let result = [];
    for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
    return result;
  };
  
  async populateData() {
    const response = await fetch('photos/metadata');
    const metaData = await response.json();
    this.setState({ metaData: metaData });
    
    let localImages = [];
    metaData.map(async meta => {
      const response = await fetch('photos/' + meta.guid + '/thumb');
      const data = await response.blob();
      localImages.push({image: data, metaData: meta});
      this.setState({ images: localImages, loading: false})
    });
  }
  
  toggleImageName() {
    this.setState({ showImageName: !this.state.showImageName });
  }

  toggleColumns() {
    const columns = this.state.columns === 3? 
    5 : this.state.columns === 5? 7 : 
    3;
    this.setState({ columns: columns });
  }
  
  sortImagesByDate() {
    let sortedImages = [...this.state.images].sort((a, b) => {
      if (this.state.sortOrder) {
        return a.metaData.dateTaken > b.metaData.dateTaken
      } else {
        return a.metaData.dateTaken < b.metaData.dateTaken
      }
    });
    this.setState({ images: sortedImages, sortOrder: !this.state.sortOrder});
  }

  render() {
    let indexing = this.state.loading
      ? <p><em>Indexing...</em></p>
      : <p className="align-right">{this.state.images.length} photos</p>;

    return (
      <div>
        <div className="fixed">
          <button className="btn btn-custom" onClick={this.toggleImageName}>Toggle image name</button>
          <button className="btn btn-custom" onClick={this.sortImagesByDate}>Sort</button>
          <button className="btn btn-custom" onClick={this.toggleColumns}>Zoom</button>
        </div>
            { indexing }
        <div>
        {Home.groupByN(this.state.columns, this.state.images).map((group, index) => (
          <div key={index} className="row align-items-center g-1 mb-1">
            {group.map(image =>
              <div className="col" key={image.metaData.guid}>
                <ModalImage
                  small={URL.createObjectURL(image.image)}
                  medium={"photos/" + image.metaData.guid + "/medium"}
                  large={"photos/" + image.metaData.guid}
                  alt={image.metaData.name + " - " + image.metaData.dateTaken}
                  showRotate="true"
                />                
                <span className="txt-sm txt-ww">{this.state.showImageName && image.metaData.name}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      </div>
    );
  }  
}
