import { OpenAI } from "openai";

const client = new OpenAI({
	baseURL: "https://router.huggingface.co/v1",
	apiKey: process.env.HF_TOKEN,
});

const chatCompletion = await client.chat.completions.create({
	model: "google/gemma-3-27b-it:featherless-ai",
    messages: [
        {
            role: "user",
            content: [
                {
                    type: "text",
                    text: "Describe this image in one sentence.",
                },
                {
                    type: "image_url",
                    image_url: {
                        url: "https://cdn.britannica.com/61/93061-050-99147DCE/Statue-of-Liberty-Island-New-York-Bay.jpg",
                    },
                },
            ],
        },
    ],
});

console.log(chatCompletion.choices[0].message);