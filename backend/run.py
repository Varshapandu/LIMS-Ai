#!/usr/bin/env python
"""Start the FastAPI backend server."""

import os

import uvicorn

if __name__ == "__main__":
    # Ensure we're in the backend directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Run the server
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
