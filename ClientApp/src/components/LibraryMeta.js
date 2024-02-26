import React, { Component } from 'react';

export class LibraryMeta extends Component {
  static displayName = LibraryMeta.name;

  constructor(props) {
    super(props);
    this.state = { images: [], loading: true };
  }

  componentDidMount() {
    this.populateData();
  }

  static renderTable(images) {
    return (
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
          {images.map(image =>
            <tr key={image.guid}>
              <td>{image.guid}</td>
              <td>{image.name}</td>
              <td>{image.sizeKb}</td>
              <td>{image.dateTaken}</td>
              <td>{image.width}</td>
              <td>{image.height}</td>
            </tr>
          )}
        </tbody>
      </table>
    );
  }

  render() {
    let contents = this.state.loading
      ? <p><em>Loading...</em></p>
      : LibraryMeta.renderTable(this.state.images);

    return (
      <div className="white-bkg">
        <h1 id="tableLabel">Photos metadata</h1>
        <p>{this.state.images.length} photos indexed</p>
        {contents}
      </div>
    );
  }

  async populateData() {
    const response = await fetch('photos/metadata');
    const data = await response.json();
    this.setState({ images: data, loading: false });
  }
}
