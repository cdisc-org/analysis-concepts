from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, validator, Field
from typing import List, Optional, Dict, Any
from datetime import date

app = FastAPI()

# Pydantic models derived from JSON Schema
class OntologyReference(BaseModel):
    IRI: str = Field(..., regex=r"^http://")
    ONTOLOGY: str
    LABEL: str

class Ontology(BaseModel):
    STATO_IRI: str = Field(..., regex=r"^http://purl\.obolibrary\.org/obo/STATO_[0-9]{7}$")
    STATO_LABEL: str
    ADDITIONAL_IRIS: List[OntologyReference] = []

class ACInput(BaseModel):
    INPUT_ID: str = Field(..., regex=r"^IN_[0-9]{3}$")
    SOURCE_AC: Optional[str] = Field(None, regex=r"^[A-Z]_AC_[0-9]{3}$")
    SOURCE_VARIABLE: str
    ROLE: str
    REQUIRED: bool
    DATA_TYPE: str = Field(..., regex="^(Numeric|Character|Date|Integer|Boolean)$")
    STATO_IRI: Optional[str]

class ACOutput(BaseModel):
    OUTPUT_ID: str = Field(..., regex=r"^OUT_[0-9]{3}$")
    VARIABLE_NAME: str
    DESCRIPTION: str
    DATA_TYPE: str = Field(..., regex="^(Numeric|Character|Date|Integer|Boolean)$")
    STATO_IRI: Optional[str]

class Method(BaseModel):
    IMPLEMENTATION: str
    PARAMETERS: Dict[str, Any] = {}

class Context(BaseModel):
    POPULATION: str
    TIMING: List[str]
    GROUPING: List[str] = []

class Metadata(BaseModel):
    VERSION: str = Field(..., regex=r"^[0-9]+\.[0-9]+$")
    CREATED_DATE: date
    CREATED_BY: str
    LAST_MODIFIED_DATE: Optional[date]
    LAST_MODIFIED_BY: Optional[str]
    STATUS: Optional[str] = Field(None, regex="^(Draft|In Progress|Complete|Deprecated)$")
    REVIEW_STATUS: Optional[str] = Field(None, regex="^(Not Started|Under Review|Approved|Rejected)$")

class AnalysisConcept(BaseModel):
    AC_ID: str = Field(..., regex=r"^[A-Z]_AC_[0-9]{3}$")
    AC_NAME: str = Field(..., min_length=1, max_length=200)
    AC_PURPOSE: str = Field(..., min_length=1)
    ONTOLOGY: Ontology
    INPUTS: List[ACInput]
    OUTPUTS: List[ACOutput]
    METHOD: Method
    CONTEXT: Context
    METADATA: Metadata

# API endpoints with automatic validation
@app.post("/api/acs")
async def create_ac(ac: AnalysisConcept):
    """
    Create new AC - Pydantic automatically validates against schema
    """
    # Validation happens automatically
    # If invalid, FastAPI returns 422 with detailed error
    db.acs.insert_one(ac.dict())
    return {"status": "created", "ac_id": ac.AC_ID}

@app.get("/api/acs/{ac_id}", response_model=AnalysisConcept)
async def get_ac(ac_id: str):
    """
    Get AC - response automatically validated against schema
    """
    ac_data = db.acs.find_one({"AC_ID": ac_id})
    if not ac_data:
        raise HTTPException(status_code=404, detail="AC not found")
    return ac_data