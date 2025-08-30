import os
from pypdf import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
from supabase import create_client
from dotenv import load_dotenv

# --- Load environment variables ---
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Load embedding model ---
model = SentenceTransformer("all-MiniLM-L6-v2")

# --- Helper: extract text from PDF ---
def load_pdf_text(path):
    reader = PdfReader(path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
    return text

# --- Helper: split text into chunks ---
splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200
)

# --- Helper: store chunks into Supabase ---
def store_chunks(chunks, metadata={}):
    for chunk in chunks:
        embedding = model.encode(chunk).tolist()
        supabase.table("documents").insert({
            "content": chunk,
            "metadata": metadata,
            "embedding": embedding
        }).execute()

# --- MAIN ---
if __name__ == "__main__":
    pdf_path = "sample.pdf"   # replace with your PDF filename
    print(f"📂 Loading {pdf_path}...")

    text = load_pdf_text(pdf_path)
    chunks = splitter.split_text(text)

    print(f"✅ Split into {len(chunks)} chunks, storing in Supabase...")
    store_chunks(chunks, {"source": pdf_path})

    print("🎉 Done! Your PDF is now indexed in Supabase.")
