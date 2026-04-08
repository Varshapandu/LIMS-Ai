#!/usr/bin/env python
"""Initialize sample data in the SQLite database."""

import sys
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal, engine
from app.models.models import Base
from app.db.init_db import init_reference_data

if __name__ == "__main__":
    # Create all tables
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✓ Tables created")

    # Initialize reference and sample data
    print("Initializing reference data...")
    db = SessionLocal()
    try:
        init_reference_data(db)
        print("✓ Reference and sample data initialized")
    except Exception as e:
        print(f"✗ Error initializing data: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

    print("\n✓ Database initialization complete!")
    print("You can now start the backend server with:")
    print("  python -m uvicorn app.main:app --reload")
