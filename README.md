# Listicle

This is a Next.js / TypeScript application that allows users to generate useless lists of things they've have learned from [SUBJECT] about [OBJECT]. The form calls an API endpoint that posts a request to an LLM 

## Project Structure

```
listicle
├── app
│   ├── api
│   │   └── submit
│   │       └──route.ts    # API endpoint for handling submissions
│   └── page.tsx           # Main entry point of the application
├── public                 # Static files
├── styles
│   └── globals.css        # Global CSS styles
├── tsconfig.json          # TypeScript configuration
├── package.json           # npm configuration
└── README.md              # Project documentation
```

## Getting Started

To get started with this project, follow these steps:

1. Clone the repository:
   ```
   git clone https://github.com/hellomrmekkelholt/listicle.git
   ```

2. Navigate to the project directory:
   ```
   cd listicle
   ```

3. Install the dependencies:
   ```
   pnpm install
   ```

4. Update the .env with the UTL of your LLM. The demo version used LM Studio:
   ```
   OPENAI_API_URL=http://localhost:1234/v1
   OPENAI_API_KEY=your_openai_api_key
   ```

5. Run the development server:
   ```
   pnpm run dev
   ```

6. Open your browser and go to `http://localhost:3000` to see the application in action.

## API Endpoint

The API endpoint is located at `/api/submit/routes.ts`. It accepts POST requests with a JSON body containing `subject` and `object`. It then wraps these into a prompt that it passes to the LLM. The response will include a message confirming the submitted data.

## License

This project is licensed under the MIT License.