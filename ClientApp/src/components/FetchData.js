import React, { Component } from 'react';

export class FetchData extends Component {
  static displayName = FetchData.name;

  constructor(props) {
    super(props);
    this.state = { forecasts: [], loading: true };
  }

  componentDidMount() {
    this.populateData();
  }

  static renderTable(forecasts) {
    return (
      <table className="table table-striped" aria-labelledby="tableLabel">
        <thead>
          <tr>
            <th>Guid</th>
            <th>Name</th>
            <th>Size</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {forecasts.map(forecast =>
            <tr key={forecast.guid}>
              <td>{forecast.guid}</td>
              <td>{forecast.name}</td>
              <td>{forecast.sizekb}</td>
              <td>{forecast.date}</td>
            </tr>
          )}
        </tbody>
      </table>
    );
  }

  render() {
    let contents = this.state.loading
      ? <p><em>Loading...</em></p>
      : FetchData.renderTable(this.state.forecasts);

    return (
      <div>
        <h1 id="tableLabel">Image metadata</h1>
        {contents}
      </div>
    );
  }

  async populateData() {
    const response = await fetch('photo');
    const data = await response.json();
    this.setState({ forecasts: data, loading: false });
  }
}
