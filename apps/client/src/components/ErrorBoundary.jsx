import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-icon">⚠</div>
          <h2>Something went wrong</h2>
          <p>{this.state.error.message}</p>
          <button
            type="button"
            className="btn-primary"
            style={{ width: "auto", padding: "0.6rem 1.5rem" }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
